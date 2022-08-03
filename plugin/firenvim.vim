if exists('g:firenvim_loaded')
        finish
endif
let g:firenvim_loaded = 1

augroup FirenvimUIEnterAugroup
        autocmd!
        autocmd UIEnter * call firenvim#onUIEnter(deepcopy(v:event))
augroup END

function FirenvimWrite()
        return nvim_buf_get_lines(0, 0, -1, 0)
endfunction
