local websocket = require("firenvim-websocket")

local function close_server(server)
        vim.loop.close(server)
        -- Work around https://github.com/glacambre/firenvim/issues/49 Note:
        -- important to do this before nvim_command("qall") because it breaks
        vim.loop.new_timer():start(1000, 100, (function() os.exit() end))
        vim.schedule(function()
                vim.api.nvim_command("qall!")
        end)
end

local function connection_handler(server, sock, token)
        local pipe = vim.loop.new_pipe(false)
        vim.loop.pipe_connect(pipe, os.getenv("NVIM_LISTEN_ADDRESS"), function(err)
                assert(not err, err)
        end)

        local header_parser = coroutine.create(websocket.parse_headers)
        coroutine.resume(header_parser, "")
        local request, headers = nil, nil

        local frame_decoder = coroutine.create(websocket.decode_frame)
        coroutine.resume(frame_decoder, nil)
        local decoded_frame = nil
        local current_payload = ""

        return function(err, chunk)
                assert(not err, err)
                if not chunk then
                        return close_server()
                end
                local _
                if not headers then
                        _ , request, headers = coroutine.resume(header_parser, chunk)
                        if not request then
                                -- Coroutine hasn't parsed the request
                                -- because it isn't complete yet
                                return
                        end
                        if not (string.match(request, "^GET /" .. token .. " HTTP/1.1\r\n$")
                                        and string.match(headers["Connection"] or "", "Upgrade")
                                        and string.match(headers["Upgrade"] or "", "websocket"))
                                then
                                -- Connection didn't give us the right
                                -- token, isn't a websocket request or
                                -- hasn't been made from a webextension
                                -- context: abort.
                                sock:close()
                                close_server(server)
                                return
                        end
                        sock:write(websocket.accept_connection(headers))
                        pipe:read_start(function(error, v)
                                assert(not error, error)
                                if v then
                                        sock:write(websocket.encode_frame(v))
                                end
                        end)
                        return
                end
                _, decoded_frame = coroutine.resume(frame_decoder, chunk)
                while decoded_frame ~= nil do
                        if decoded_frame.opcode == websocket.opcodes.binary then
                                current_payload = current_payload .. decoded_frame.payload
                                if decoded_frame.fin then
                                        pipe:write(current_payload)
                                        current_payload = ""
                                end
                        elseif decoded_frame.opcode == websocket.opcodes.ping then
                                -- TODO: implement websocket.pong_frame
                                -- sock:write(websocket.pong_frame(decoded_frame))
                                return
                        elseif decoded_frame.opcode == websocket.opcodes.close then
                                sock:write(websocket.close_frame(decoded_frame))
                                sock:close()
                                pipe:close()
                                close_server(server)
                                return
                        end
                        _, decoded_frame = coroutine.resume(frame_decoder, "")
                end
        end
end

local function firenvim_start_server(token)
        local server = vim.loop.new_tcp()
        server:nodelay(true)
        server:bind('127.0.0.1', 0)
        server:listen(128, function(err)
                assert(not err, err)
                local sock = vim.loop.new_tcp()
                server:accept(sock)
                sock:read_start(connection_handler(server, sock, token))
        end)
        return server:getsockname().port
end

return {
        start_server = firenvim_start_server,
}
