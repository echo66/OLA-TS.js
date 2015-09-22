# OLA-TS.js

OLA-TS.js is an audio time stretching implementation of a modified Overlap and Add (OLA) algorithm.

# Constructor

*OLATS(Number frameSize)*: frameSize must be an integer. The default window type is the Lanczos.

# API

*process(TypedArray inputArray, CBuffer outputArray)*: executes the time stretching of inputArray with the current parameters (use *set_alpha* to configure them). The inputArray will be overlapped with an intermediary buffer and the first 

*clear_buffers()*: TODO. Useful when you need to use a different audio buffer as the source of input frames.

*set_alpha(Number alpha, Number overlap, Number beta)*: defines the stretching factor and, optionally, the overlapping factor and window exponent. TODO

*set_window_type(String windowType)*: changes the type of the window used within OLA. Available types are Lanczos, Triangular, Bartlett, BartlettHann, Blackman, Cosine, Gauss, Hamming, Hann, Rectangular, SinBeta.

*get_alpha()*: TODO

*get_ra()*: Return the analysis hop size.

*get_rs()*: Return the synthesis hop size.

*get_overlap_factor()*: Return the overlapping factor.

*get_beta()*: TODO



# Note

I'm still trying to understand why this works so "well" for 4096 samples. In fact, I developed this as the result of making a mistake with the basic Overlap and Add algorithm.
