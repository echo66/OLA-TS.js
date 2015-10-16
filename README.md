# OLA-TS.js

OLA-TS.js is an audio time stretching implementation of a modified Overlap and Add (OLA) algorithm.
Demo: http://echo66.github.io/demos/OLA-TS.js/

# Constructor

*OLATS(Number frameSize)*: frameSize must be an integer. The default window type is the Lanczos.

# API

*process(Array inputFrame, CBuffer outputFrame): given a (mono) frame, performs a time stretching iteration and pushes H s samples in the output CBuffer.

*clear_buffers()*: clears all internal buffers, like the overlapping buffer. This can be useful for audio players that need to create a noticeable stop in the transition to the next file in a playlist, in order to avoid using the phase of the previous song to adjust the phase of the next song.

*set_alpha(Number alpha, Number overlap, Number beta)*: given the new stretching factor, it computes the new values for Hs , Ha (both integers) and invokes the function pointed by *overlap_fn*.

*set_window_type(String windowType)*: changes the type of the window used within OLA. Available types are Lanczos, Triangular, Bartlett, BartlettHann, Blackman, Cosine, Gauss, Hamming, Hann, Rectangular, SinBeta.

*beta_fn(Number alpha)*: public field pointing to a function that, given a stretching factor α, will return a new window exponent.

*overlap_fn(Number alpha)*: public field pointing to a function that, given a stretching factor α, will return a new overlapping factor.

*get_alpha()*: returns the last specified stretching factor.

*get_ha()*: returns the current analysis hop size. This function calculates the increment to the “read head” of the input signal, when playing an audio file.

*get_hs()*: returns the current synthesis hop size. This function calculates the increment to the output signal position which an be used to guide the cursor in the UI of an audio player using OLA-TS.js as time stretcher.

*get_overlap_factor()*: returns the current overlapping factor.

*get_beta()*: returns the current window exponent.


# Helpers

*BufferedOLA*: TODO

*WAAPlayer*: TODO


# Notes

* Audio quality, in OLA-TS.js, is strongly dependent on (1) frame size and (2) the overlapping factor. For small frame sizes (=< 2048) and songs with harmonic structures like voices, there will be modulation in the output, which can be minimized with careful management of the overlapping factor (overlap_fn) and window exponent (beta_fn). For large frame sizes (>= 4096), the modulation becomes less perceivable. 

* This time stretcher is recommended for applications that need a cheap solution for time stretching while maintaining good quality for harmonic structures and do not require very fast manipulation of the time stretch factor.


# Roadmap

* Formal analysis of the algorithm.
