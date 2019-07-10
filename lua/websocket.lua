local utils = require("utils")

local function parse_headers()
        local headerend = nil
        local headerstring = ""
        -- Accumulate header lines until we have them all
        while headerend == nil do
                headerstring = headerstring .. coroutine.yield(nil, nil, nil)
                headerend = string.find(headerstring, "\r?\n\r?\n")
        end

        -- request is the first line of any HTTP request: `GET /file HTTP/1.1`
        local request = string.sub(headerstring, 1, string.find(headerstring, "\n") - 1)
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

local function accept_connection(headers)
        return "HTTP/1.1 101 Swithing Protocols\n" ..
        "Connection: Upgrade\r\n" ..
        "Sec-WebSocket-Accept: " .. compute_key(headers["Sec-WebSocket-Key"]) .. "\r\n" ..
        "Upgrade: websocket\r\n" ..
        "\r\n"
end

local function decode_frame(frame)
        local result = {}
        local current_byte = 1
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
                result.payload_length = bit.lshift(string.byte(frame, current_byte), 8)
                current_byte = current_byte + 1
                result.payload_length = result.payload_length +
                        string.byte(frame, current_byte)
                current_byte = current_byte + 1
        elseif result.payload_length == 127 then
                result.payload_length = 0
                -- Can't do this because numbers are on 53 bits
                -- result.payload_length = bit.lshift(string.byte(frame, current_byte), 56)
                current_byte = current_byte + 1
                -- Can't do this because numbers are on 53 bits
                -- result.payload_length = bit.lshift(string.byte(frame, current_byte), 48)
                current_byte = current_byte + 1
                result.payload_length = result.payload_length +
                        bit.lshift(string.byte(frame, current_byte), 40)
                current_byte = current_byte + 1
                result.payload_length = result.payload_length +
                        bit.lshift(string.byte(frame, current_byte), 32)
                current_byte = current_byte + 1
                result.payload_length = result.payload_length +
                        bit.lshift(string.byte(frame, current_byte), 24)
                current_byte = current_byte + 1
                result.payload_length = result.payload_length +
                        bit.lshift(string.byte(frame, current_byte), 16)
                current_byte = current_byte + 1
                result.payload_length = result.payload_length +
                        bit.lshift(string.byte(frame, current_byte), 8)
                current_byte = current_byte + 1
                result.payload_length = result.payload_length + string.byte(frame, current_byte)
                print("Warning: payload length on 64 bits. Estimated:" .. result.payload_length)
        end
        result.masking_key = string.sub(frame, current_byte, current_byte + 4)
        current_byte = current_byte + 4

        result.payload = ""
        local payload_end = current_byte + result.payload_length - 1
        local j = 1
        for current_byte = current_byte, payload_end do
                result.payload = result.payload .. string.char(bit.bxor(
                        string.byte(frame, current_byte),
                        string.byte(result.masking_key, j)
                ))
                j = (j % 4) + 1
        end
        return result
end

return {
        accept_connection = accept_connection,
        decode_frame = decode_frame,
        parse_headers = parse_headers,
}
