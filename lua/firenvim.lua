local websocket = require("websocket")

local function close_server(server)
        vim.loop.close(server)
        -- Work around https://github.com/glacambre/firenvim/issues/49 Note:
        -- important to do this before nvim_command("qall") because it breaks
        vim.loop.new_timer():start(1000, 100, (function() os.exit() end))
        vim.schedule(function()
                vim.api.nvim_command("qall!")
        end)
end

local function connection_handler(server, sock, config, token)
        local pipe = vim.loop.new_pipe(false)
        vim.loop.pipe_connect(pipe, os.getenv("NVIM_LISTEN_ADDRESS"), function(err)
                assert(not err, err)
        end)

        local header_parser = coroutine.create(websocket.parse_headers)
        coroutine.resume(header_parser, "")
        local request, headers, rest = nil, nil, nil

        local frame_decoder = coroutine.create(websocket.decode_frame)
        coroutine.resume(frame_decoder, chunk)
        local decoded_frame = nil
        local current_payload = ""

        return function(err, chunk)
                assert(not err, err)
                if not chunk then
                        return
                end
                if not headers then
                        _, request, headers, rest = coroutine.resume(header_parser, chunk)
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
                        pipe:read_start(function(err, chunk)
                                assert(not err, err)
                                if chunk then
                                        sock:write(websocket.encode_frame(chunk))
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
                                if config.globalSettings.server ~= 'persistent' then
                                        close_server(server)
                                end
                                return
                        end
                        _, decoded_frame = coroutine.resume(frame_decoder, "")
                end
        end
end

local function firenvim_start_server(token)
        local server = vim.loop.new_tcp()
        server:nodelay(true)

        local config = {}
        if vim.fn ~= nil and vim.fn.exists('g:firenvim_config') == 1 then
                config = vim.api.nvim_get_var('firenvim_config')
        end

        if config.globalSettings == nil then
                config.globalSettings = {}
        end
        if config.localSettings == nil then
                config.localSettings = {}
        end

        local address = '127.0.0.1'
        local port = 0
        if config.globalSettings.server == 'persistent'
                and config.globalSettings.server_url ~= nil
        then
                address, port = string.match(config.globalSettings.server_url, "([^:]+):(.+)")
        end

        server:bind(address, port)
        server:listen(128, function(err)
                assert(not err, err)
                local sock = vim.loop.new_tcp()
                server:accept(sock)
                sock:read_start(connection_handler(server, sock, config, token))
        end)
        if port ~= 0 then
                return port
        end
        return server:getsockname().port
end

return {
        start_server = firenvim_start_server,
}
