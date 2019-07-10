
if exists('g:firenvim_loaded')
        finish
endif
let g:firenvim_loaded = 1

command FirenvimInstall :call firenvim#install()
command FirenvimRun :call firenvim#run()
