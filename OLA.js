function OLA(frameSize, hop) {

  this.process = function(frame) {

    var input  = window_mul(frame);
    var output = new Array(_RS);

    var delta = 0;

    overlap_and_add(_RS + delta, input, _squaredFramingWindow, _overlapBuffers, _owOverlapBuffers, _frameSize, output)

    return output;

  }

  this.get_rs = function () { return _RS; }

  this.get_ra = function () { return _RA; }

  this.set_alpha = function(newAlpha) {
    _alpha = newAlpha;

    // _RS = _fixedHop;
    // _RA = Math.round(_RS / _alpha);

    _RA = Math.round(_frameSize/_overlapFactor);
    _RS = Math.round(_alpha * _RA);

    // _RS = Math.round(_frameSize/3);
    // _RA = Math.round(_RS / _alpha);
  }

  this.get_alpha = function() { return _alpha; }

  function window_mul(frame) {
    var aux = new Float32Array(frame.length);
    for (var i=0; i<frame.length; i++) {
      aux[i] = _window[i] * frame[i];
    }
    return aux;
  }

  function create_sin_beta_window(length, beta) {

    var win = new Float32Array(length);

    for (var i=0; i<length; i++)
      win[i] = Math.pow(Math.sin(Math.PI*i/length), beta);

    return win;

  }


  function overlap_and_add(RS, inF, squaredWinF, oBuf, owOBuf, windowSize, outF) {

    var owSample = 0;

    for (var i = 0; i < RS; i++) {
      owSample = owOBuf.shift();
      outF[i] = oBuf.shift() / ((owSample<10e-3)? 1 : owSample);
      oBuf[oBuf.length] = owOBuf[owOBuf.length] = 0;
    }

    for (var i = 0; i < windowSize; i++) {
      oBuf[oBuf.length-1] = inF[i] + oBuf.shift();
      owOBuf[owOBuf.length-1] = squaredWinF[i] + owOBuf.shift();
    }

  }



  function create_constant_array(size, constant, ArrayType) {
    var arr = new ((ArrayType)?ArrayType:Array)(size);
    for (var i=0; i<size; i++)
      arr[i] = constant;
    return arr;
  }


  var _frameSize = frameSize;
  var _alpha, _RA, _RS;
  var _overlapFactor = 2.6;

  this.set_alpha(1);

  var _midBuffer = new Float32Array(_frameSize - _RS);
  var _window = create_sin_beta_window(frameSize, 4);

  var _squaredFramingWindow = new Float32Array(_window.length);
  for (var i=0; i<_squaredFramingWindow.length; i++) {
    _squaredFramingWindow[i] = Math.pow(_window[i], 1);
  }

  var _overlapBuffers = create_constant_array(_frameSize, 0, Array);
  var _owOverlapBuffers = create_constant_array(_frameSize, 0, Array);


  

}
