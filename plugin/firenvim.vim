if exists('g:firenvim_loaded')
        finish
endif

augroup FirenvimSites
	autocmd!
augroup END

let g:firenvim_loaded = 1

augroup FirenvimUIEnterAugroup
        autocmd!
        autocmd UIEnter * call firenvim#onUIEnter(deepcopy(v:event))
augroup END
