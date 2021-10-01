let s:firenvim_done = 0
let s:script_dir = expand('<sfile>:p:h:h')

function! firenvim#get_chan() abort
        if (exists('g:last_focused_firenvim_channel'))
                return g:last_focused_firenvim_channel
        endif
        let l:uis = filter(nvim_list_uis(),
                \ {i, ui -> nvim_get_chan_info(ui.chan).client.name ==? 'Firenvim'})
        if len(l:uis) != 1
                if len(l:uis) == 0
                        throw 'firenvim#focus_page(): No firenvim ui found!'
                endif
                throw 'firenvim#focus_page(): Too many UIs found!'
        endif
        return uis[0].chan
endfunction

function! firenvim#eval_js(js, ...) abort
        let callback_name = get(a:, 1, '')
        call rpcnotify(firenvim#get_chan(), 'firenvim_eval_js', a:js, callback_name)
endfunction

" Asks the browser extension to release focus from the frame and focus the
" page instead
function! firenvim#focus_input() abort
        call rpcnotify(firenvim#get_chan(), 'firenvim_focus_input')
endfunction

" Asks the browser extension to release focus from the frame and focus the
" page instead
function! firenvim#focus_page() abort
        call rpcnotify(firenvim#get_chan(), 'firenvim_focus_page')
endfunction

" Asks the browser extension to hide the firenvim frame
function! firenvim#hide_frame() abort
        call rpcnotify(firenvim#get_chan(), 'firenvim_hide_frame')
endfunction

" Asks the browser extension to send one or multiple key events to the
" underlying input field.
function! firenvim#press_keys(...) abort
        if a:0 < 1
                throw 'firenvim#press_keys expects at least one argument'
        endif
        let l:keys = copy(a:000)
        if type(l:keys[0]) == type([])
                if a:0 > 1
                        throw 'firenvim#press_keys expects a single list argument'
                endif
                let l:keys = l:keys[0]
        endif
        if len(filter(copy(l:keys), { key, value -> type(value) == type("") })) != len(l:keys)
                throw 'Key symbols must be strings.'
        endif
        call rpcnotify(firenvim#get_chan(), 'firenvim_press_keys', l:keys)
endfunction

" Asks the browser extension to hide the firenvim frame
function! firenvim#thunderbird_send() abort
        call rpcnotify(firenvim#get_chan(), 'firenvim_thunderbird_send', { 'text': nvim_buf_get_lines(0, 0, -1, 0) })
endfunction

" Turns a wsl path (forward slashes) into a windows one (backslashes)
function! s:to_windows_path(path) abort
        if a:path[0] !=# '/'
                return a:path
        endif
        let l:path_components = split(a:path, '/')
        return join([toupper(l:path_components[1]) . ':'] + path_components[2:-1], '\')
endfunction

" Turns a windows path (backslashes) into a wsl one (forward slashes)
function! s:to_wsl_path(path) abort
        if a:path[0] ==# '/'
                return a:path
        endif
        let l:path_components = split(a:path, '\\')
        return join(['/mnt', tolower(path_components[0][0:-2])] + l:path_components[1:-1], '/')
endfunction


" Simple helper to build the right path depending on the platform.
function! s:build_path(list) abort
        let l:path_separator = '/'
        if has('win32')
                let l:path_separator = "\\"
        endif
        if s:is_wsl
                let a:list[0] = s:to_wsl_path(a:list[0])
        endif
        return join(a:list, l:path_separator)
endfunction

" Retrieves a windows env var from wsl. Retrieves a windows path (with
" backslashes!)
function! s:get_windows_env_path(env) abort
        if has('win32')
                let l:env = a:env
                if l:env[0] ==# '%'
                        let l:env = '$' . l:env[1:-2]
                endif
                return expand(l:env)
        endif
        if s:is_wsl
                let l:env = a:env
                if l:env[0] ==# '$'
                        let l:env = '%' . l:env[1:-1] . '%'
                endif
                try
                        let l:cmd_output = system(['cmd.exe', '/c', 'echo', l:env])
                catch /E475:.*cmd.exe' is not executable/
                        try
                                let l:cmd_output = system(['/mnt/c/Windows/System32/cmd.exe', '/c', 'echo', l:env])
                        catch /E475:.*cmd.exe' is not executable/
                                throw 'Error: Firenvim could not find cmd.exe from WSL on your system. Please report this issue.'
                        endtry
                endtry
                return cmd_output[match(l:cmd_output, 'C:\\'):-3]
        endif
        throw 'Used get_windows_env_path on non-windows platform!'
endfunction


" Entry point of the vim-side of the extension.
" This function does the following things:
" - Get a security token from neovim's stdin
" - Bind itself to a TCP port
" - Write the security token + tcp port number to stdout()
" - Take care of forwarding messages received on the TCP port to neovim
function! firenvim#run() abort
        " Write messages to stdout according to the format expected by
        " Firefox's native messaging protocol
        function! WriteStdout(id, data) abort
                " The native messaging protocol expects the message's length
                " to precede the message. It has to use native endianness. We
                " assume big endian.
                let l:len = strlen(a:data)
                let l:lenstr = luaeval('string.char(bit.band(' . l:len . ', 255))'
                                        \. '.. string.char(bit.band(bit.rshift(' . l:len . ', 8), 255))'
                                        \. '.. string.char(bit.band(bit.rshift(' . l:len . ', 16), 255))'
                                        \. '.. string.char(bit.band(bit.rshift(' . l:len . ', 24), 255))')
                " https://github.com/neovim/neovim/pull/15211
                " Neovim 0.6 breaking change.
                try
                        call chansend(a:id, [join(l:lenstr['_VAL']) . a:data])
                catch
                        call chansend(a:id, l:lenstr)
                        call chansend(a:id, a:data)
                endtry
        endfunction
        let s:accumulated_data = ''
        function! OnStdin(id, data, event) abort
                " `:h channel-stdio`: empty a:data means FD closed?
                if a:data == ['']
                        qall!
                end
                if s:firenvim_done
                        return
                endif
                let l:data = s:accumulated_data . a:data[0]
                try
                        let l:params = json_decode(matchstr(l:data[4:], '{[^}]*}'))
                catch
                        let s:accumulated_data = l:data
                        return
                endtry
                let s:firenvim_done = v:true

                let l:package_json = s:build_path([s:script_dir, 'package.json'])
                let l:version = json_decode(join(readfile(l:package_json), "\n"))['version']
                let l:result = { 'version': l:version }

                if exists('g:firenvim_config')
                        let l:result['settings'] = g:firenvim_config
                endif

                if has_key(l:params, 'newInstance') && l:params['newInstance']
                        let l:port = luaeval("require('firenvim').start_server('" .
                                                \ l:params['password'] .
                                                \ "')")
                        let l:result['port'] = l:port
                endif

                call WriteStdout(a:id, json_encode(result))
        endfunction
        let l:chanid = stdioopen({ 'on_stdin': 'OnStdin' })
endfunction

" Wrapper function that executes funcname(...args) if a $DRY_RUN env variable
" isn't defined and just echoes `funcname(...args)` if it is.
function! s:maybe_execute(funcname, ...) abort
        let l:result = ''
        if !empty($DRY_RUN)
                echo a:funcname . '(' . string(a:000)[1:-2] . ')'
        else
                let l:result = call(a:funcname, a:000)
        end
        return l:result
endfunction

" Returns the name of the script that should be executed by the browser.
function! s:get_executable_name() abort
        if has('win32') || s:is_wsl
                return 'firenvim.bat'
        endif
        return 'firenvim'
endfunction

" Returns the path of the directory in which firenvim will run when the
" browser launches it.
" On wsl, this is a path living on the linux side.
function! s:get_runtime_dir_path() abort
        let l:xdg_runtime_dir = $XDG_RUNTIME_DIR
        if l:xdg_runtime_dir ==# ''
                if has('win32') || s:is_wsl
                        let l:xdg_runtime_dir = s:get_windows_env_path('$TEMP')
                        if l:xdg_runtime_dir ==# ''
                                let l:xdg_runtime_dir = s:get_windows_env_path('$TMP')
                        endif
                        if l:xdg_runtime_dir ==# ''
                                let l:xdg_runtime_dir = s:get_windows_env_path('$USERPROFILE')
                                if l:xdg_runtime_dir ==# ''
                                        let l:xdg_runtime_dir = fnamemodify(stdpath('data'), ':h')
                                else
                                        let l:xdg_runtime_dir = l:xdg_runtime_dir . '\AppData\Local\Temp'
                                endif
                        endif
                else
                        let l:xdg_runtime_dir = $TMPDIR
                        if l:xdg_runtime_dir ==# ''
                                let l:xdg_runtime_dir = '/tmp/'
                        endif
                endif
        endif
        return s:build_path([l:xdg_runtime_dir, 'firenvim'])
endfunction

" Returns the directory in which the firenvim script is written.
function! s:get_data_dir_path() abort
        let l:xdg_data_home = $XDG_DATA_HOME
        if s:is_wsl
                let l:xdg_data_home = s:get_windows_env_path('%LOCALAPPDATA%')
        elseif l:xdg_data_home ==# ''
                let l:xdg_data_home = fnamemodify(stdpath('data'), ':h')
        endif
        return s:build_path([l:xdg_data_home, 'firenvim'])
endfunction

function! s:firefox_config_exists() abort
        let l:p = [$HOME, '.mozilla']
        if has('mac')
                let l:p = [$HOME, 'Library', 'Application Support', 'Mozilla']
        elseif has('win32')
                let l:p = [$HOME, 'AppData', 'Roaming', 'Mozilla', 'Firefox']
        elseif s:is_wsl
                let l:p = [s:get_windows_env_path('%APPDATA%'), 'Mozilla', 'Firefox']
        endif
        return isdirectory(s:build_path(l:p))
endfunction

function! s:get_firefox_manifest_dir_path() abort
        if has('mac')
                return s:build_path([$HOME, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts'])
        elseif has('win32') || s:is_wsl
                return s:get_data_dir_path()
        end
        return s:build_path([$HOME, '.mozilla', 'native-messaging-hosts'])
endfunction

function! s:brave_config_exists() abort
        let l:p = [$HOME, '.config', 'BraveSoftware']
        if has('mac')
                let l:p = [$HOME, 'Library', 'Application Support', 'BraveSoftware']
        elseif has('win32')
                let l:p = [$HOME, 'AppData', 'Local', 'BraveSoftware']
        elseif s:is_wsl
                let l:p = [s:get_windows_env_path('%LOCALAPPDATA%'), 'BraveSoftware']
        elseif !empty($XDG_CONFIG_HOME)
                let l:p = [$XDG_CONFIG_HOME, 'BraveSoftware']
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:opera_config_exists() abort
        let l:p = [$HOME, '.config', 'opera']
        if has('mac')
                let l:p = [$HOME, 'Library', 'Application Support', 'com.operasoftware.Opera']
        elseif has('win32')
                let l:p = [$HOME, 'AppData', 'Local', 'Opera Software']
        elseif s:is_wsl
                let l:p = [s:get_windows_env_path('%LOCALAPPDATA%'), 'Opera Software']
        elseif !empty($XDG_CONFIG_HOME)
                let l:p = [$XDG_CONFIG_HOME, 'opera']
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:vivaldi_config_exists() abort
        let l:p = [$HOME, '.config', 'vivaldi']
        if has('mac')
                let l:p = [$HOME, 'Library', 'Application Support', 'Vivaldi']
        elseif has('win32')
                let l:p = [$HOME, 'AppData', 'Local', 'Vivaldi']
        elseif s:is_wsl
                let l:p = [s:get_windows_env_path('%LOCALAPPDATA%'), 'Vivaldi']
        elseif !empty($XDG_CONFIG_HOME)
                let l:p = [$XDG_CONFIG_HOME, 'vivaldi']
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:chrome_config_exists() abort
        let l:p = [$HOME, '.config', 'google-chrome']
        if has('mac')
                let l:p = [$HOME, 'Library', 'Application Support', 'Google', 'Chrome']
        elseif has('win32')
                let l:p = [$HOME, 'AppData', 'Local', 'Google', 'Chrome']
        elseif s:is_wsl
                let l:p = [s:get_windows_env_path('%LOCALAPPDATA%'), 'Google', 'Chrome']
        elseif !empty($XDG_CONFIG_HOME)
                let l:p = [$XDG_CONFIG_HOME, 'google-chrome']
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:ungoogled_chromium_config_exists() abort
        let l:p = [$HOME, '.config', 'ungoogled-chromium']
        if has('mac')
                " According to #1007, on macos, things work when using the
                " regular chrome dir.
                return v:false
        elseif has('win32') || s:is_wsl
                " Don't know what should be used here. Wait for somebody to
                " complain.
                return v:false
        elseif !empty($XDG_CONFIG_HOME)
                let l:p = [$XDG_CONFIG_HOME, 'ungoogled-chromium']
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:edge_config_exists() abort
        let l:p = [$HOME, '.config', 'microsoft-edge']
        if has('mac')
                let l:p = [$HOME, 'Library', 'Application Support', 'Microsoft', 'Edge']
        elseif has('win32')
                let l:p = [$HOME, 'AppData', 'Local', 'Microsoft', 'Edge']
        elseif s:is_wsl
                let l:p = [s:get_windows_env_path('%LOCALAPPDATA%'), 'Microsoft', 'Edge']
        elseif !empty($XDG_CONFIG_HOME)
                let l:p = [$XDG_CONFIG_HOME, 'microsoft-edge']
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:chrome_dev_config_exists() abort
        let l:p = [$HOME, '.config', 'google-chrome-unstable']
        if has('mac')
                let l:p = [$HOME, 'Library', 'Application Support', 'Google', 'Chrome Dev']
        elseif !empty($XDG_CONFIG_HOME)
                let l:p = [$XDG_CONFIG_HOME, 'google-chrome-unstable']
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:get_chrome_manifest_dir_path() abort
        if has('mac')
                return s:build_path([$HOME, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'])
        elseif has('win32') || s:is_wsl
                return s:get_data_dir_path()
        end
        if !empty($XDG_CONFIG_HOME)
                return s:build_path([$XDG_CONFIG_HOME, 'google-chrome', 'NativeMessagingHosts'])
        end
        return s:build_path([$HOME, '.config', 'google-chrome', 'NativeMessagingHosts'])
endfunction

function! s:get_ungoogled_chromium_manifest_dir_path() abort
        if has('mac') || has('win32') || s:is_wsl
                throw "Ungoogled chromium isn't supported. Please open an issue to add support."
        end
        if !empty($XDG_CONFIG_HOME)
                return s:build_path([$XDG_CONFIG_HOME, 'ungoogled-chromium', 'NativeMessagingHosts'])
        end
        return s:build_path([$HOME, '.config', 'ungoogled-chromium', 'NativeMessagingHosts'])
endfunction

function! s:get_edge_manifest_dir_path() abort
        if has('mac')
                return s:build_path([$HOME, 'Library', 'Application Support', 'Microsoft', 'Edge', 'NativeMessagingHosts'])
        elseif has('win32') || s:is_wsl
                return s:get_data_dir_path()
        end
        if !empty($XDG_CONFIG_HOME)
                return s:build_path([$XDG_CONFIG_HOME, 'microsoft-edge', 'NativeMessagingHosts'])
        end
        return s:build_path([$HOME, '.config', 'microsoft-edge', 'NativeMessagingHosts'])
endfunction

function! s:get_chrome_dev_manifest_dir_path() abort
        if has('mac')
                return s:build_path([$HOME, 'Library', 'Application Support', 'Google', 'Chrome Dev', 'NativeMessagingHosts'])
        elseif has('win32') || s:is_wsl
                throw 'No chrome dev on win32.'
        end
        if !empty($XDG_CONFIG_HOME)
                return s:build_path([$XDG_CONFIG_HOME, 'google-chrome-unstable', 'NativeMessagingHosts'])
        end
        return s:build_path([$HOME, '.config', 'google-chrome-unstable', 'NativeMessagingHosts'])
endfunction

function! s:get_brave_manifest_dir_path() abort
        if has('mac')
                return s:get_chrome_manifest_dir_path()
        elseif has('win32') || s:is_wsl
                return s:get_chrome_manifest_dir_path()
        end
        if !empty($XDG_CONFIG_HOME)
                return s:build_path([$XDG_CONFIG_HOME, 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts'])
        end
        return s:build_path([$HOME, '.config', 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts'])
endfunction

function! s:canary_config_exists() abort
        if has('mac')
                let l:p = [$HOME, 'Library', 'Application Support', 'Google', 'Chrome Canary']
        elseif has('win32')
                let l:p = [$HOME, 'AppData', 'Local', 'Google', 'Chrome SxS']
        elseif s:is_wsl
                let l:p = [s:get_windows_env_path('%LOCALAPPDATA%'), 'Google', 'Chrome SxS']
        else
                " Chrome canary doesn't exist on linux
                return v:false
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:get_canary_manifest_dir_path() abort
        if has('mac')
                return s:build_path([$HOME, 'Library', 'Application Support', 'Google', 'Chrome Canary', 'NativeMessagingHosts'])
        elseif has('win32') || s:is_wsl
                return s:get_data_dir_path()
        end
        throw "Chrome Canary doesn't exist on Linux"
endfunction

function! s:chromium_config_exists() abort
        let l:p = [$HOME, '.config', 'chromium']
        if has('mac')
                let l:p = [$HOME, 'Library', 'Application Support', 'Chromium']
        elseif has('win32')
                let l:p = [$HOME, 'AppData', 'Local', 'Chromium']
        elseif s:is_wsl
                let l:p = [s:get_windows_env_path('%LOCALAPPDATA%'), 'Chromium']
        end
        if !empty($XDG_CONFIG_HOME)
                let l:p = [$XDG_CONFIG_HOME, 'chromium', 'NativeMessagingHosts']
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:get_chromium_manifest_dir_path() abort
        if has('mac')
                return s:build_path([$HOME, 'Library', 'Application Support', 'Chromium', 'NativeMessagingHosts'])
        elseif has('win32') || s:is_wsl
                return s:get_data_dir_path()
        end
        if !empty($XDG_CONFIG_HOME)
                return s:build_path([$XDG_CONFIG_HOME, 'chromium', 'NativeMessagingHosts'])
        end
        return s:build_path([$HOME, '.config', 'chromium', 'NativeMessagingHosts'])
endfunction

function! s:get_progpath() abort
        let l:result = v:progpath
        if $APPIMAGE !=# ''
                " v:progpath is different every time you run neovim appimages
                let l:result = $APPIMAGE
        endif
        " Some package managers will install neovim in a version-specific path
        " that v:progpath will point to. This is an issue because the path may
        " break when neovim is updated. Try to detect these cases, work around
        " them if possible and warn the user.
        let l:specific_installs = {
                \ 'homebrew': {
                        \ 'pattern': '^/usr/local/Cellar/',
                        \ 'constant_paths': ['/usr/local/opt/nvim']
                \ },
                \ 'nix': {
                        \ 'pattern': '^/nix/store/',
                        \ 'constant_paths': [
                                \ expand('$HOME/.nix-profile/bin/nvim'),
                                \ '/run/current-system/sw/bin/nvim'
                        \ ]
                \ }
        \ }
        for l:package_manager in keys(l:specific_installs)
                let l:install = l:specific_installs[l:package_manager]
                if match(l:result, l:install['pattern']) == 0
                        let l:warning = 'Warning: ' . l:package_manager . ' path detected. '
                        let l:alternative_found = v:false
                        for l:constant_path in l:install['constant_paths']
                                if executable(l:constant_path)
                                        let l:warning = l:warning .
                                                \ "Using '" . l:constant_path . "'" .
                                                \ "' instead of '" . l:result . "'"
                                        let l:result = l:constant_path
                                        let l:alternative_found = v:true
                                        break
                                endif
                        endfor
                        if !l:alternative_found
                                let l:warning = l:warning .
                                        \ 'Firenvim may break next time you update neovim.'
                        endif
                        echo l:warning
                endif
        endfor
        return l:result
endfunction

function! s:get_executable_content(data_dir, prolog) abort
        if has('win32') || s:is_wsl
                let l:wsl_prefix = ''
                if s:is_wsl
                        let l:wsl_prefix = 'wsl'
                endif
                let l:dir = s:to_windows_path(a:data_dir)
                return  "@echo off\r\n" .
                                        \ "mkdir \"" . l:dir . "\" 2>nul\r\n" .
                                        \ "cd \"" . l:dir . "\"\r\n" .
                                        \ a:prolog . "\r\n" .
                                        \ l:wsl_prefix . ' ' . "\"" . s:get_progpath() . "\" --headless --cmd \"let g:started_by_firenvim = v:true\" -c \"call firenvim#run()\"\r\n"
        endif
        return "#!/bin/sh\n" .
                                \ 'mkdir -p ' . a:data_dir . "\n" .
                                \ 'chmod 700 ' . a:data_dir . "\n" .
                                \ 'cd ' . a:data_dir . "\n" .
                                \ 'export PATH="$PATH:' . $PATH . "\"\n" .
                                \ "unset NVIM_LISTEN_ADDRESS\n" .
                                \ 'if [ -n "$VIM" ] && [ ! -d "$VIM" ]; then' . "\n" .
                                \ "  unset VIM\n" .
                                \ "fi\n" .
                                \ 'if [ -n "$VIMRUNTIME" ] && [ ! -d "$VIMRUNTIME" ]; then' . "\n" .
                                \ "  unset VIMRUNTIME\n" .
                                \ "fi\n" .
                                \ a:prolog . "\n" .
                                \ "exec '" . s:get_progpath() . "' --headless --cmd 'let g:started_by_firenvim = v:true' -c 'call firenvim#run()'\n"
endfunction

function! s:get_manifest_beginning(execute_nvim_path) abort
        return '{
                                \ "name": "firenvim",
                                \ "description": "Turn your browser into a Neovim GUI.",
                                \ "path": "' . substitute(a:execute_nvim_path, '\', '\\\\', 'g') . '",
                                \ "type": "stdio",
                                \'
endfunction

function! s:get_chrome_manifest(execute_nvim_path) abort
        return s:get_manifest_beginning(a:execute_nvim_path) .
                                \' "allowed_origins": [
                                \ "chrome-extension://egpjdkipkomnmjhjmdamaniclmdlobbo/"
                                \ ]
                                \}'
endfunction

function! s:get_firefox_manifest(execute_nvim_path) abort
        return s:get_manifest_beginning(a:execute_nvim_path) .
                                \' "allowed_extensions": ["firenvim@lacamb.re"]
                                \}'
endfunction

function! s:key_to_ps1_str(key, manifest_path) abort
        let l:ps1_content = ''
        let l:key_arr = split(a:key, '\')
        let l:i = 0
        for l:i in range(2, len(l:key_arr) - 1)
                let l:ps1_content = l:ps1_content . "\nNew-Item -Path \"" . join(key_arr[0:i], '\') . '"'
        endfor
        " Then, assign a value to it
        return l:ps1_content . "\nSet-Item -Path \"" .
                                \ a:key .
                                \ '\" -Value "' . s:to_windows_path(a:manifest_path) . '"'
endfunction

function! s:get_browser_configuration() abort
        " Brave, Opera and Vivaldi all rely on Chrome's native messenger
        let l:browsers = {
                \'brave': {
                        \ 'has_config': s:brave_config_exists(),
                        \ 'manifest_content': function('s:get_chrome_manifest'),
                        \ 'manifest_dir_path': function('s:get_brave_manifest_dir_path'),
                        \ 'registry_key': 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\firenvim',
                \},
                \'chrome': {
                        \ 'has_config': s:chrome_config_exists(),
                        \ 'manifest_content': function('s:get_chrome_manifest'),
                        \ 'manifest_dir_path': function('s:get_chrome_manifest_dir_path'),
                        \ 'registry_key': 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\firenvim',
                \},
                \'chrome-canary': {
                        \ 'has_config': s:canary_config_exists(),
                        \ 'manifest_content': function('s:get_chrome_manifest'),
                        \ 'manifest_dir_path': function('s:get_canary_manifest_dir_path'),
                        \ 'registry_key': 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\firenvim',
                \},
                \'chrome-dev': {
                        \ 'has_config': s:chrome_dev_config_exists(),
                        \ 'manifest_content': function('s:get_chrome_manifest'),
                        \ 'manifest_dir_path': function('s:get_chrome_dev_manifest_dir_path'),
                        \ 'registry_key': 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\firenvim',
                \},
                \'chromium': {
                        \ 'has_config': s:chromium_config_exists(),
                        \ 'manifest_content': function('s:get_chrome_manifest'),
                        \ 'manifest_dir_path': function('s:get_chromium_manifest_dir_path'),
                        \ 'registry_key': 'HKCU:\Software\Chromium\NativeMessagingHosts\firenvim',
                \},
                \'edge': {
                        \ 'has_config': s:edge_config_exists(),
                        \ 'manifest_content': function('s:get_chrome_manifest'),
                        \ 'manifest_dir_path': function('s:get_edge_manifest_dir_path'),
                        \ 'registry_key': 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\firenvim',
                \},
                \'firefox': {
                        \ 'has_config': s:firefox_config_exists(),
                        \ 'manifest_content': function('s:get_firefox_manifest'),
                        \ 'manifest_dir_path': function('s:get_firefox_manifest_dir_path'),
                        \ 'registry_key': 'HKCU:\Software\Mozilla\NativeMessagingHosts\firenvim',
                \},
                \'opera': {
                        \ 'has_config': s:opera_config_exists(),
                        \ 'manifest_content': function('s:get_chrome_manifest'),
                        \ 'manifest_dir_path': function('s:get_chrome_manifest_dir_path'),
                        \ 'registry_key': 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\firenvim',
                \},
                \'ungoogled-chromium': {
                        \ 'has_config': s:ungoogled_chromium_config_exists(),
                        \ 'manifest_content': function('s:get_chrome_manifest'),
                        \ 'manifest_dir_path': function('s:get_ungoogled_chromium_manifest_dir_path'),
                        \ 'registry_key': 'HKCU:\Software\Chromium\NativeMessagingHosts\firenvim',
                \},
                \'vivaldi': {
                        \ 'has_config': s:vivaldi_config_exists(),
                        \ 'manifest_content': function('s:get_chrome_manifest'),
                        \ 'manifest_dir_path': function('s:get_chrome_manifest_dir_path'),
                        \ 'registry_key': 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\firenvim',
                \}
        \}
        if $TESTING == 1
                call remove(l:browsers, 'brave')
                call remove(l:browsers, 'chrome-dev')
                call remove(l:browsers, 'opera')
                call remove(l:browsers, 'ungoogled-chromium')
                call remove(l:browsers, 'vivaldi')
        endif
        return l:browsers

endfunction

" At first, is_wsl is set to false, even on WSL. This lets us install firenvim
" on the wsl side, in case people want to use a wsl browser.
" Then, we set is_wsl to true if we're on wsl and launch firenvim#install
" again, installing things on the host side.
let s:is_wsl = v:false

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
"
" firenvim#install accepts the following optional arguments:
" a:1: 0 to let firenvim detect what browsers the user wants to use or 1 to
"      force install for every browser.
" a:2: A prologue that should be inserted in the shell/batch script and
"      executed before neovim is ran.
function! firenvim#install(...) abort
        if !has('nvim-0.4.0')
                echoerr 'Error: nvim version >= 0.4.0 required. Aborting.'
                return
        endif

        let l:force_install = 0
        let l:script_prolog = ''
        if a:0 > 0
                let l:force_install = a:1
                if a:0 > 1
                        let l:script_prolog = a:2
                endif
        endif

        " Decide where the script responsible for starting neovim should be
        let l:data_dir = s:get_data_dir_path()
        let l:execute_nvim_path = s:build_path([l:data_dir, s:get_executable_name()])

        " Write said script to said path
        let l:execute_nvim = s:get_executable_content(s:get_runtime_dir_path(), l:script_prolog)

        call s:maybe_execute('mkdir', l:data_dir, 'p', 0700)
        if s:is_wsl
                let l:execute_nvim_path = s:to_wsl_path(l:execute_nvim_path)
        endif
        call s:maybe_execute('writefile', split(l:execute_nvim, "\n"), l:execute_nvim_path)
        if s:is_wsl
                let l:execute_nvim_path = s:to_windows_path(l:execute_nvim_path)
        endif
        call s:maybe_execute('setfperm', l:execute_nvim_path, 'rwx------')

        let l:browsers = s:get_browser_configuration()

        let l:powershell_script = ''
        for l:name in keys(l:browsers)
                let l:cur_browser = l:browsers[l:name]
                if !l:cur_browser['has_config'] && !l:force_install
                        echo 'No config detected for ' . l:name . '. Skipping.'
                        continue
                endif

                try
                        let l:manifest_content = l:cur_browser['manifest_content'](l:execute_nvim_path)
                        let l:manifest_dir_path = l:cur_browser['manifest_dir_path']()
                        let l:manifest_path = s:build_path([l:manifest_dir_path, 'firenvim.json'])
                catch /.*/
                        echo 'Aborting installation for ' . l:name . '. ' . v:exception
                        continue
                endtry

                if has('win32') || s:is_wsl
                        let l:manifest_path = s:build_path([l:manifest_dir_path, 'firenvim-' . l:name . '.json'])
                endif

                call s:maybe_execute('mkdir', l:manifest_dir_path, 'p', 0700)
                call s:maybe_execute('writefile', [l:manifest_content], l:manifest_path)
                call s:maybe_execute('setfperm', l:manifest_path, 'rw-------')

                echo 'Installed native manifest for ' . l:name . '.'

                if has('win32') || s:is_wsl
                        " On windows, also create a registry key. We do this
                        " by writing a powershell script to a file and
                        " executing it.
                        let l:ps1_content = s:key_to_ps1_str(l:cur_browser['registry_key'],
                                                \ l:manifest_path)
                        let l:ps1_path = s:build_path([l:manifest_dir_path, l:name . '.ps1'])
                        echo 'Creating registry key for ' . l:name . '. This may take a while. Script: ' . l:ps1_path
                        call s:maybe_execute('writefile', split(l:ps1_content, "\n"), l:ps1_path)
                        call s:maybe_execute('setfperm', l:ps1_path, 'rwx------')
                        try
                                let o = s:maybe_execute('system', ['powershell.exe', '-Command', '-'], readfile(l:ps1_path))
                        catch /powershell.exe' is not executable/
                                let l:failure = v:true
                                let l:msg = 'Error: Firenvim could not find powershell.exe'
                                " If the failure happened on wsl, try to use
                                " an absolute path
                                if s:is_wsl
                                        let l:msg += ' from WSL'
                                        try
                                                let o = s:maybe_execute('system', ['/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', '-Command', '-'], readfile(l:ps1_path))
                                                let l:failure = v:false
                                        catch /powershell.exe' is not executable/
                                                let l:failure = v:true
                                        endtry
                                endif
                                let l:msg += ' on your system. Please report this issue.'
                                if l:failure
                                        echomsg 'Note: created ' . l:ps1_path . " . You may try to run it manually by right-clicking from your file browser to complete Firenvim's installation."
                                        throw l:msg
                                endif
                        endtry

                        if v:shell_error
                          echo o
                        endif

                        echo 'Created registry key for ' . l:name . '.'
                endif
        endfor

        if !s:is_wsl
                let s:is_wsl = !empty($WSLENV) || !empty($WSL_DISTRO_NAME) || !empty ($WSL_INTEROP)
                if s:is_wsl
                        echo 'Installation complete on the wsl side. Performing install on the windows side.'
                        call firenvim#install(l:force_install, l:script_prolog)
                endif
        endif
endfunction

" Removes files created by Firenvim during its installation process
function! firenvim#uninstall() abort

        let l:data_dir = s:get_data_dir_path()
        call delete(l:data_dir, 'rf')
        echo 'Removed firenvim data directory.'

        let l:browsers = s:get_browser_configuration()

        for l:name in keys(l:browsers)
                let l:cur_browser = l:browsers[l:name]
                if !l:cur_browser['has_config']
                        continue
                endif

                let l:manifest_dir_path = l:cur_browser['manifest_dir_path']()
                let l:manifest_path = s:build_path([l:manifest_dir_path, 'firenvim.json'])

                if has('win32')
                        let l:manifest_path = s:build_path([l:manifest_dir_path, 'firenvim-' . l:name . '.json'])
                endif

                if has('win32') || s:is_wsl
                        echo 'Removing registry key for ' . l:name . '. This may take a while.'
                        let l:ps1_content = 'Remove-Item -Path "' . l:cur_browser['registry_key'] . '" -Recurse'
                        let o = system(['powershell.exe', '-Command', '-'], [l:ps1_content])
                        if v:shell_error
                          echo o
                        endif
                        echo 'Removed registry key for ' . l:name . '.'
                endif

                call delete(l:manifest_path)
                echo 'Removed native manifest for ' . l:name . '.'
        endfor
endfunction

function! firenvim#onUIEnter(event) abort
        let l:ui = nvim_get_chan_info(a:event.chan)
        if has_key(l:ui, 'client') && has_key(l:ui.client, 'name') &&
                                \ l:ui.client.name =~? 'Firenvim'
                call map(nvim_list_bufs(), {key, val -> firenvimft#detect(val)})
                augroup FirenvimFtdetectAugroup
                        autocmd!
                        autocmd BufRead,BufNewFile *.txt call firenvimft#detect(str2nr(expand('<abuf>')))
                augroup END
        endif
endfunction
