
let s:patterns_to_ft = {
        \ '/github.com_.*\.txt$': 'markdown',
        \ '/\(\w\+\.\)*reddit\.com_.*\.txt$': 'markdown',
        \ '/stackoverflow.com_.*\.txt$': 'markdown',
        \ '/stackexchange.com_.*\.txt$': 'markdown',
        \ '/slack.com_.*\.txt$': 'markdown',
        \ '/gitter.com_.*\.txt$': 'markdown',
        \ '/riot.im_.*\.txt$': 'markdown',
        \ '/lobste.rs_.*\.txt$': 'markdown',
        \ '/cocalc.com_.*\.txt$': 'python',
        \ '/kaggleusercontent.com_.*\.txt$': 'python',
  \ }

function! firenvimft#detect(buf) abort
        let l:name = nvim_buf_get_name(a:buf)
        if l:name !~? '/firenvim/.*\.txt$'
                return 0
        endif
        let l:ft = 'text'
        for l:pattern in keys(s:patterns_to_ft)
                if l:name =~? l:pattern
                        call nvim_buf_set_option(a:buf, 'filetype', s:patterns_to_ft[l:pattern])
                        return
                endif
        endfor
endfunction
