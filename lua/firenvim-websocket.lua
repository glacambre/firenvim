if bit == nil then
        bit = require("bit")
end

local utils = require("firenvim-utils")

local opcodes = {
        text = 1,
        binary = 2,
        close = 8,
        ping = 9,
        pong = 10,
}

-- The client's handshake is described here: https://tools.ietf.org/html/rfc6455#section-4.2.1
local function parse_headers()
        local headerend = nil
        local headerstring = ""
        -- Accumulate header lines until we have them all
        while headerend == nil do
                headerstring = headerstring .. coroutine.yield(nil, nil, nil)
                headerend = string.find(headerstring, "\r?\n\r?\n")
        end

        -- request is the first line of any HTTP request: `GET /file HTTP/1.1`
        local request = string.sub(headerstring, 1, string.find(headerstring, "\n"))
        -- rest is any data that might follow the actual HTTP request
        -- (GET+key/values). If I understand the spec correctly, it should be
        -- empty.
        local rest = string.sub(headerstring, headerend + 2)

        local keyvalues = string.sub(headerstring, string.len(request))
        local headerobj = {}
        for key, value in string.gmatch(keyvalues, "([^:]+) *: *([^\r\n]+)\r?\n") do
                headerobj[key] = value
        end
        return request, headerobj, rest
end

local function compute_key(key)
        return utils.base64(utils.sha1(key .. "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
end

-- The server's opening handshake is described here: https://tools.ietf.org/html/rfc6455#section-4.2.2
local function accept_connection(headers)
        return "HTTP/1.1 101 Swithing Protocols\n" ..
        "Connection: Upgrade\r\n" ..
        "Sec-WebSocket-Accept: " .. compute_key(headers["Sec-WebSocket-Key"]) .. "\r\n" ..
        "Upgrade: websocket\r\n" ..
        "\r\n"
end

-- Frames are described here: https://tools.ietf.org/html/rfc6455#section-5.2
local function decode_frame()
        local frame = ""
        local result = {}
        while true do
                local current_byte = 1
                -- We need at least the first two bytes of header in order to
                -- start doing any kind of useful work:
                -- - One for the fin/rsv/opcode fields
                -- - One for the mask + payload length
                while (string.len(frame) < 2) do
                        frame = frame .. coroutine.yield(nil)
                end

                result.fin = bit.band(bit.rshift(string.byte(frame, current_byte), 7), 1) == 1
                result.rsv1 = bit.band(bit.rshift(string.byte(frame, current_byte), 6), 1) == 1
                result.rsv2 = bit.band(bit.rshift(string.byte(frame, current_byte), 5), 1) == 1
                result.rsv3 = bit.band(bit.rshift(string.byte(frame, current_byte), 4), 1) == 1
                result.opcode = bit.band(string.byte(frame, current_byte), 15)
                current_byte = current_byte + 1

                result.mask = bit.rshift(string.byte(frame, current_byte), 7) == 1
                result.payload_length = bit.band(string.byte(frame, current_byte), 127)
                current_byte = current_byte + 1

                if result.payload_length == 126 then
                        -- Payload length is on the next two bytes, make sure
                        -- they're present
                        while (string.len(frame) < current_byte + 2) do
                                frame = frame .. coroutine.yield(nil)
                        end

                        result.payload_length = utils.to_16_bits_number(string.sub(frame, current_byte))
                        current_byte = current_byte + 2
                elseif result.payload_length == 127 then
                        -- Payload length is on the next eight bytes, make sure
                        -- they're present
                        while (string.len(frame) < current_byte + 8) do
                                frame = frame .. coroutine.yield(nil)
                        end
                        result.payload_length = utils.to_64_bits_number(string.sub(frame, current_byte))
                        print("Warning: payload length on 64 bits. Estimated:" .. result.payload_length)
                        current_byte = current_byte + 8
                end

                while string.len(frame) < current_byte + result.payload_length do
                        frame = frame .. coroutine.yield(nil)
                end

                result.masking_key = string.sub(frame, current_byte, current_byte + 4)
                current_byte = current_byte + 4

                result.payload = ""
                local payload_end = current_byte + result.payload_length - 1
                local j = 1
                for i = current_byte, payload_end do
                        result.payload = result.payload .. string.char(bit.bxor(
                                        string.byte(frame, i),
                                        string.byte(result.masking_key, j)
                                ))
                        j = (j % 4) + 1
                end
                current_byte = payload_end + 1
                frame = string.sub(frame, current_byte) .. coroutine.yield(result)
        end
end

-- The format is the same as the client's (
-- https://tools.ietf.org/html/rfc6455#section-5.2 ), except we don't need to
-- mask the data.
local function encode_frame(data)
        -- 130: 10000010
        -- Fin: 1
        -- RSV{1,2,3}: 0
        -- Opcode: 2 (binary frame)
        local header = string.char(130)
        local len
        if string.len(data) < 126 then
                len = string.char(string.len(data))
        elseif string.len(data) < 65536 then
                len = string.char(126) .. utils.to_16_bits_str(string.len(data))
        else
                len = string.char(127) .. utils.to_64_bits_str(string.len(data))
        end
        return  header .. len .. data
end

local function close_frame()
        local frame = encode_frame("")
        return string.char(136) .. string.sub(frame, 2)
end

return {
        accept_connection = accept_connection,
        close_frame = close_frame,
        decode_frame = decode_frame,
        encode_frame = encode_frame,
        opcodes = opcodes,
        parse_headers = parse_headers,
}
