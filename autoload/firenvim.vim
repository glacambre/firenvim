let g:firenvim_port_opened = 0

" Simple helper to build the right path depending on the platform.
function! s:build_path(list)
        let l:path_separator = "/"
        if has("win32")
                let l:path_separator = "\\"
        endif
        return join(a:list, path_separator)
endfunction

" Entry point of the vim-side of the extension.
" This function does the following things:
" - Generate a security token
" - Bind itself to a TCP port
" - Write the security token + tcp port number to stdout()
" - Take care of forwarding messages received on the TCP port to neovim
function! firenvim#run()
        " Write messages to stdout according to the format expected by
        " Firefox's native messaging protocol
        function! WriteStdout(id, data)
                if strlen(a:data) > 254
                        throw "firenvim#run()WriteStdout doesn't handle messages more than 254 bytes long."
                endif
                call chansend(a:id, [strlen(a:data) . "\0\0\0" . a:data])
        endfunction
        function! OnStdin(id, data, event)
                if g:firenvim_port_opened
                        return
                endif
                let l:port = luaeval('require("firenvim").start_server("' . a:data[0][4:] . '")')
                let g:firenvim_port_opened = 1
                call WriteStdout(a:id, l:port)
        endfunction
        let l:chanid = stdioopen({ 'on_stdin': 'OnStdin' })
endfunction

" Installing firenvim requires several steps:
" - Create a batch/shell script that takes care of starting neovim with the
"   right arguments. This is needed because the webextension api doesn't let
"   users specify what arguments programs should be started with
" - Create a manifest file that lets the browser know where the script created
"   can be found
" - On windows, also create a registry key that points to the native manifest
"
" Manifest paths & registry stuff are specified here: 
" https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests#Manifest_location
function! firenvim#install()
        " Decide where the script responsible for starting neovim when firefox
        " asks for it should be placed
        let l:execute_nvim_name_unix = "firenvim.sh"
        let l:execute_nvim_name_win = "firenvim.bat"
        let l:execute_nvim_name = l:execute_nvim_name_unix
        if has("win32")
                let l:execute_nvim_name = l:execute_nvim_name_win
        endif

        let l:xdg_data_home = $XDG_DATA_HOME
        if l:xdg_data_home == ""
                let l:xdg_data_home = fnamemodify(stdpath("data"), ":h")
        endif
        let l:data_dir = s:build_path([l:xdg_data_home, "firenvim"])
        let l:execute_nvim_path = s:build_path([l:data_dir, l:execute_nvim_name])

        " Build native manifest and place it where firefox can find it
        let l:manifest_content = '{
                                \ "name": "firenvim",
                                \ "decription": "Turn Firefox into a Neovim client.",
                                \ "path": "' . substitute(l:execute_nvim_path, '\', '\\\\', 'g') . '",
                                \ "type": "stdio",
                                \ "allowed_extensions": ["firenvim@lacamb.re"]
                                \}'
        let l:manifest_dir_path_mac = s:build_path([$HOME, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts'])
        let l:manifest_dir_path_linux = s:build_path([$HOME, '.mozilla', 'native-messaging-hosts'])
        let l:manifest_dir_path_win = l:data_dir
        let l:manifest_dir_path = l:manifest_dir_path_linux
        if has('mac')
                let l:manifest_dir_path = l:manifest_dir_path_mac
        elseif has('win32')
                let l:manifest_dir_path = l:manifest_dir_path_win
        end
        let l:manifest_path = s:build_path([l:manifest_dir_path, "firenvim.json"])

        call mkdir(l:manifest_dir_path, "p", 0700)
        call writefile([l:manifest_content], l:manifest_path)
        call setfperm(l:manifest_path, "rw-------")

        " Build startup scripts and place them where needed
        let l:execute_nvim_sh = "#!/bin/sh\n
                                \ cd " . l:data_dir . "\n
                                \ exec '" . v:progpath . "' --headless -c 'FirenvimRun'\n
                                \"

        let l:execute_nvim_bat = "@echo off\n" .
                                \ "dir " . l:data_dir . "\n" .
                                \ v:progpath . " --headless -c FirenvimRun\n"

        let l:execute_nvim = l:execute_nvim_sh
        if has("win32")
                let l:execute_nvim = l:execute_nvim_bat
        endif

        call mkdir(l:data_dir, "p", 0700)
        call writefile(split(l:execute_nvim, "\n"), l:execute_nvim_path)
        call setfperm(l:execute_nvim_path, "rwx------")

        if has("win32")
                " On windows, also create a registry key.
                " We do this by writing a powershell script to a file and
                " executing it.
                let l:ps1_content = ""
                let l:key = 'HKCU:\Software\Mozilla\NativeMessagingHosts\firenvim'
                " First, make sure the whole path exists
                let l:key_arr = split(l:key, '\')
                let l:i = 0
                for l:i in range(2, len(key_arr) - 1)
                        let l:ps1_content = l:ps1_content . "\nNew-Item -Path \"" . join(key_arr[0:i], '\') . '"'
                endfor
                " Then, assign a value to it
                let l:ps1_content = l:ps1_content . "\nSet-Item -Path \"" .
                                        \ l:key .
                                        \ '\" -Value "' . l:manifest_path . '"'
                let l:ps1_path = s:build_path([l:manifest_dir_path, "create_registry_key.ps1"])
                call writefile(split(l:ps1_content, "\n"), l:ps1_path)
                call setfperm(l:ps1_path, "rwx------")
                call system('powershell "' . l:ps1_path . '"')
        endif
endfunction

call firenvim#install()
