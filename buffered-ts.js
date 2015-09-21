function BufferedTS(frameSize) {

	var _frameSize = frameSize || 4096;
	var _olaL = new OLATS(_frameSize);
	var _olaR = new OLATS(_frameSize);
	var _buffer;
	var _position = 0;
	var _alpha = 1;

	var _midBufL = new CBuffer(Math.round(_frameSize * 1.2));
	var _midBufR = new CBuffer(Math.round(_frameSize * 1.2));

	

	this.process = function(outputAudioBuffer) {

		if (!_buffer) 
			return;

		var sampleCounter = 0;

        var il = _buffer.getChannelData(0);
        var ir = _buffer.getChannelData(0);
        var ol = outputAudioBuffer.getChannelData(0);
        var or = outputAudioBuffer.getChannelData(1);


        while (_midBufR.size > 0 && sampleCounter < outputAudioBuffer.length) {
          var i = sampleCounter++;
          ol[i] = _midBufL.shift();
          or[i] = _midBufR.shift();
        }

        if (sampleCounter >= _frameSize)
          return;

        do {

          var bufL = il.subarray(_position, _position + _frameSize);
          var bufR = ir.subarray(_position, _position + _frameSize);

          if (_alpha) {
            _olaL.set_alpha(_alpha, overlap, beta);
            _olaR.set_alpha(_alpha, overlap, beta);
          }


          /* LEFT */
          _olaL.process(bufL, _midBufL);
          _olaR.process(bufR, _midBufR);
          for (var i=sampleCounter; _midBufL.size > 0 && i < outputAudioBuffer.length; i++) {
            ol[i] = _midBufL.shift();
            or[i] = _midBufR.shift();
          }

          sampleCounter += _olaL.get_rs();

          _position
           += _olaL.get_ra();

        } while (sampleCounter < outputAudioBuffer.length);
	}

	this.set_audio_buffer = function(newBuffer) {
		_buffer = newBuffer;
	}

	Object.defineProperties(this, {
		'position' : {
			get : function() {
				return _position;
			}, 
			set : function(newPosition) {
				_position = newPosition;
			}
		}, 
		'alpha' : {
			get : function() {
				return _alpha;
			}, 
			set : function(newAlpha) {
				_alpha = newAlpha;
			}
		}
	});
}