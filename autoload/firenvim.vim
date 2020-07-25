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

function! firenvim#eval_js(js) abort
        call rpcnotify(firenvim#get_chan(), 'firenvim_eval_js', a:js)
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

" Simple helper to build the right path depending on the platform.
function! s:build_path(list) abort
        let l:path_separator = '/'
        if has('win32')
                let l:path_separator = "\\"
        endif
        return join(a:list, l:path_separator)
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
                                        \. '.. string.char(bit.band(bit.rshift(' . l:len . ', 24), 255))')['_VAL']
                call chansend(a:id, [join(l:lenstr) . a:data])
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

function! s:get_executable_name() abort
        if has('win32')
                return 'firenvim.bat'
        endif
        return 'firenvim'
endfunction

function! s:get_runtime_dir_path() abort
        let l:xdg_runtime_dir = $XDG_RUNTIME_DIR
        if l:xdg_runtime_dir ==# ''
                if has('win32')
                        let l:xdg_runtime_dir = expand('$TEMP')
                        if l:xdg_runtime_dir ==# ''
                                let l:xdg_runtime_dir = expand('$TMP')
                        endif
                        if l:xdg_runtime_dir ==# ''
                                let l:xdg_runtime_dir = expand('$USERPROFILE')
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

function! s:get_data_dir_path() abort
        let l:xdg_data_home = $XDG_DATA_HOME
        if l:xdg_data_home ==# ''
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
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:get_firefox_manifest_dir_path() abort
        if has('mac')
                return s:build_path([$HOME, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts'])
        elseif has('win32')
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
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:opera_config_exists() abort
        let l:p = [$HOME, '.config', 'opera']
        if has('mac')
                let l:p = [$HOME, 'Library', 'Application Support', 'com.operasoftware.Opera']
        elseif has('win32')
                let l:p = [$HOME, 'AppData', 'Local', 'Opera Software']
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:vivaldi_config_exists() abort
        let l:p = [$HOME, '.config', 'vivaldi']
        if has('mac')
                let l:p = [$HOME, 'Library', 'Application Support', 'Vivaldi']
        elseif has('win32')
                let l:p = [$HOME, 'AppData', 'Local', 'Vivaldi']
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:chrome_config_exists() abort
        let l:p = [$HOME, '.config', 'google-chrome']
        if has('mac')
                let l:p = [$HOME, 'Library', 'Application Support', 'Google', 'Chrome']
        elseif has('win32')
                let l:p = [$HOME, 'AppData', 'Local', 'Google', 'Chrome']
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:get_chrome_manifest_dir_path() abort
        if has('mac')
                return s:build_path([$HOME, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'])
        elseif has('win32')
                return s:get_data_dir_path()
        end
        return s:build_path([$HOME, '.config', 'google-chrome', 'NativeMessagingHosts'])
endfunction

function! s:canary_config_exists() abort
        if has('mac')
                let l:p = [$HOME, 'Library', 'Application Support', 'Google', 'Chrome Canary']
        elseif has('win32')
                let l:p = [$HOME, 'AppData', 'Local', 'Google', 'Chrome SxS']
        else
                " Chrome canary doesn't exist on linux
                return v:false
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:get_canary_manifest_dir_path() abort
        if has('mac')
                return s:build_path([$HOME, 'Library', 'Application Support', 'Google', 'Chrome Canary', 'NativeMessagingHosts'])
        elseif has('win32')
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
        end
        return isdirectory(s:build_path(l:p))
endfunction

function! s:get_chromium_manifest_dir_path() abort
        if has('mac')
                return s:build_path([$HOME, 'Library', 'Application Support', 'Chromium', 'NativeMessagingHosts'])
        elseif has('win32')
                return s:get_data_dir_path()
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
        if has('win32')
                return  "@echo off\r\n" .
                                        \ "mkdir \"" . a:data_dir . "\" 2>nul\r\n" .
                                        \ "cd \"" . a:data_dir . "\"\r\n" .
                                        \ a:prolog . "\r\n" .
                                        \ "\"" . s:get_progpath() . "\" --headless --cmd \"let g:started_by_firenvim = v:true\" -c \"call firenvim#run()\"\r\n"
        endif
        return "#!/bin/sh\n" .
                                \ 'mkdir -p ' . a:data_dir . "\n" .
                                \ 'chmod 700 ' . a:data_dir . "\n" .
                                \ 'cd ' . a:data_dir . "\n" .
                                \ "unset NVIM_LISTEN_ADDRESS\n" .
                                \ 'export PATH="$PATH:' . $PATH . "\"\n" .
                                \ a:prolog . "\n" .
                                \ "exec '" . s:get_progpath() . "' --headless --cmd 'let g:started_by_firenvim = v:true' -c 'call firenvim#run()'\n"
endfunction

function! s:get_manifest_beginning(execute_nvim_path) abort
        return '{
                                \ "name": "firenvim",
                                \ "description": "Turn Firefox into a Neovim client.",
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
                                \ '\" -Value "' . a:manifest_path . '"'
endfunction

function! s:get_browser_configuration() abort
        " Brave, Opera and Vivaldi all rely on Chrome's native messenger
        let l:browsers = {
                \'brave': {
                        \ 'has_config': s:brave_config_exists(),
                        \ 'manifest_content': function('s:get_chrome_manifest'),
                        \ 'manifest_dir_path': function('s:get_chrome_manifest_dir_path'),
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
                \'chromium': {
                        \ 'has_config': s:chromium_config_exists(),
                        \ 'manifest_content': function('s:get_chrome_manifest'),
                        \ 'manifest_dir_path': function('s:get_chromium_manifest_dir_path'),
                        \ 'registry_key': 'HKCU:\Software\Chromium\NativeMessagingHosts\firenvim',
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
                \'vivaldi': {
                        \ 'has_config': s:vivaldi_config_exists(),
                        \ 'manifest_content': function('s:get_chrome_manifest'),
                        \ 'manifest_dir_path': function('s:get_chrome_manifest_dir_path'),
                        \ 'registry_key': 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\firenvim',
                \}
        \}
        if $TESTING == 1
                call remove(l:browsers, 'brave')
                call remove(l:browsers, 'vivaldi')
                call remove(l:browsers, 'opera')
        endif
        return l:browsers
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

        call mkdir(l:data_dir, 'p', 0700)
        call writefile(split(l:execute_nvim, "\n"), l:execute_nvim_path)
        call setfperm(l:execute_nvim_path, 'rwx------')

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
                
                if has('win32')
                        let l:manifest_path = s:build_path([l:manifest_dir_path, 'firenvim-' . l:name . '.json'])
                endif

                call mkdir(l:manifest_dir_path, 'p', 0700)
                call writefile([l:manifest_content], l:manifest_path)
                call setfperm(l:manifest_path, 'rw-------')

                echo 'Installed native manifest for ' . l:name . '.'

                if has('win32')
                        " On windows, also create a registry key. We do this
                        " by writing a powershell script to a file and
                        " executing it.
                        let l:ps1_content = s:key_to_ps1_str(l:cur_browser['registry_key'],
                                                \ l:manifest_path)
                        let l:ps1_path = s:build_path([l:manifest_dir_path, l:name . '.ps1'])
                        echo 'Creating registry key for ' . l:name . '. This may take a while. Script: ' . l:ps1_path
                        call writefile(split(l:ps1_content, "\n"), l:ps1_path)
                        call setfperm(l:ps1_path, 'rwx------')
                        let o = system(['powershell', '-Command', '-'], readfile(l:ps1_path))
                        if v:shell_error
                          echo o
                        endif

                        echo 'Created registry key for ' . l:name . '.'
                endif
        endfor
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

                if has('win32')
                        echo 'Removing registry key for ' . l:name . '. This may take a while.'
                        let l:ps1_content = 'Remove-Item -Path "' . l:cur_browser['registry_key'] . '" -Recurse'
                        let o = system(['powershell', '-Command', '-'], [l:ps1_content])
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
