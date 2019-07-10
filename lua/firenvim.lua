local websocket = require("websocket")

local function close_server(server)
        vim.loop.close(server)
        vim.schedule(function()
                vim.api.nvim_command("qall!")
        end)
end

local function firenvim_start_server(token)
        local server = vim.loop.new_tcp()
        server:bind('127.0.0.1', 0)
        server:listen(128, function(err)
                assert(not err, err)
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
                                if not (string.match(request, token)
                                        and string.match(headers["Connection"] or "", "Upgrade")
                                        and string.match(headers["Origin"] or "", "^moz%-extension://")
                                        and string.match(headers["Upgrade"] or "", "websocket"))
                                        then
                                                -- Connection didn't give us
                                                -- the right token, isn't a
                                                -- websocket request or hasn't
                                                -- been made from a
                                                -- webextension context: abort.
                                                sock:close()
                                                close_server(server)
                                                return
                                end
                                sock:write(websocket.accept_connection(headers))
                                return
                        end
                        local decoded_frame = websocket.decode_frame(chunk)
                        current_payload = current_payload .. decoded_frame.payload
                        if not decoded_frame.fin then
                                return
                        end
                        current_payload = ""
                end)
        end)
        return server:getsockname().port
end

return {
        start_server = firenvim_start_server,
}
