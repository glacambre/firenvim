local websocket = require("websocket")

local function close_server(server)
        vim.loop.close(server)
        vim.schedule(function()
                vim.api.nvim_command("qall!")
        end)
end

local function firenvim_start_server(token, origin)
        local server = vim.loop.new_tcp()
        server:bind('127.0.0.1', 0)
        server:listen(128, function(err)
                assert(not err, err)
                local pipe = vim.loop.new_pipe(false)
                vim.loop.pipe_connect(pipe, os.getenv("NVIM_LISTEN_ADDRESS"), function(err)
                        assert(not err, err)
                end)
                local sock = vim.loop.new_tcp()
                server:accept(sock)
                local header_parser = coroutine.create(websocket.parse_headers, sock)
                coroutine.resume(header_parser, "")
                local request, headers, rest = nil, nil, nil
                local current_payload = ""
                sock:read_start(function(err, chunk)
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
                                local origin_pattern = "^" .. string.gsub(origin, "-", "%%-") .. "$"
                                if not (string.match(request, "^GET /" .. token .. " HTTP/1.1\r\n$")
                                        and string.match(headers["Connection"] or "", "Upgrade")
                                        and string.match(headers["Origin"] or "", origin_pattern)
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
                        while chunk ~= "" do
                                local decoded_frame = websocket.decode_frame(chunk)
                                chunk = decoded_frame.rest
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
                        end
                end)
        end)
        return server:getsockname().port
end

return {
        start_server = firenvim_start_server,
}
