function OLATS(frameSize, windowType) {

  this.process = function(frame) {

    var input  = window_mul(frame);
    
    var output = new Array(_RS);

    var delta = 0;

    overlap_and_add(_RS + delta, input, _squaredFramingWindow, _overlapBuffers, _owOverlapBuffers, _frameSize, output)

    return output;

  }

  function overlap_and_add(RS, inF, squaredWinF, oBuf, owOBuf, windowSize, outF) {

    var owSample = 0;

    for (var i = 0; i < RS; i++) {
      owSample = owOBuf.shift() || 0;
      outF[i] = oBuf.shift() / ((owSample<10e-3)? 1 : owSample);
      oBuf[oBuf.length] = owOBuf[owOBuf.length] = 0;
    }

    for (var i = 0; i < windowSize; i++) {
      oBuf[oBuf.length-1] = inF[i] + oBuf.shift();
      owOBuf[owOBuf.length-1] = squaredWinF[i] + owOBuf.shift();
    }

  }

  /*
   * --------------
   *    Getters
   * --------------
   */

  this.get_rs = function () { return _RS; }

  this.get_ra = function () { return _RA; }

  this.get_alpha = function() { return _alpha; }

  this.get_overlap_factor = function() { return _overlapFactor; }


  /*
   * --------------
   *    Setters
   * --------------
   */

  this.set_overlap = function(newOverlap) {
    _overlapFactor = newOverlap;
  }

  this.set_alpha = function(newAlpha) {
    _alpha = newAlpha;

    if (_alpha <= 1) {
      this.set_beta(1);
    } else if (_alpha <= 1.2) {
      this.set_beta(1.5)
    } else if (_alpha > 1.2) {
      this.set_beta(2.5);
    }

    if (_alpha < 1.25) {
      _overlapFactor = _alpha + 0.1;
    } else if (_alpha >= 1.25 && _alpha < 1.5) {
      _overlapFactor = _alpha + 0.2;
    } else if (_alpha >= 1.5 && _alpha < 1.8) {
      _overlapFactor = _alpha + 0.6;
    } else if (_alpha >= 1.8 && _alpha < 2) {
      _overlapFactor = _alpha + 0.9;
    } else if (_alpha >= 2 && _alpha < 2.5) {
      _overlapFactor = _alpha + 2.2;
    } else if (_alpha >= 2.5 && _alpha <= 3) {
      _overlapFactor = _alpha + 2.2;
    }

    // Fixed analysis hop
    _RA = Math.round(_frameSize/_overlapFactor);
    _RS = Math.round(_alpha * _RA);

    // console.log([newAlpha, _RS/_RA]);

    // Fixed synthesis hop
    // _RS = Math.round(_frameSize/_overlapFactor);
    // _RA = Math.round(_RS / _alpha);
  }

  this.set_beta = function(newBeta) {
    _beta = newBeta;

    _window = create_window(_frameSize, _beta, _windowType);

    _squaredFramingWindow = new Float32Array(_window.length);
    for (var i=0; i<_squaredFramingWindow.length; i++) 
      _squaredFramingWindow[i] = Math.pow(_window[i], 1);
    
  }

  this.set_overlap = function(newOverlap) {
    _overlapFactor = newOverlap;
  }


  /*
   * --------------
   *    Helpers
   * --------------
   */

  function window_mul(frame) {
    var aux = new Float32Array(frame.length);
    for (var i=0; i<frame.length; i++) {
      aux[i] = _window[i] * frame[i];
    }
    return aux;
  }

  function create_window(length, beta, type) {

    var win = new Float32Array(length);

    // for (var i=0; i<length; i++)
    //   win[i] = Math.pow(Math.sin(Math.PI*i/length), beta);
    for (var i=0; i<length; i++) {
      win[i] = WindowFunctions[type](length, i, beta);
    }

    return win;

  }

  function create_constant_array(size, constant, ArrayType) {
    var arr = new ((ArrayType)?ArrayType:Array)(size);
    for (var i=0; i<size; i++)
      arr[i] = constant;
    return arr;
  }

  var WindowFunctions = {

    Lanczos : function(length, index, beta) {
      var x = 2 * index / (length - 1) - 1;
      return Math.pow(Math.sin(Math.PI * x) / (Math.PI * x), beta);
    },

    Triangular : function(length, index, beta) {
      return Math.pow(2 / length * (length / 2 - Math.abs(index - (length - 1) / 2)), beta);
    }
  };


  var _frameSize = frameSize;
  var _alpha, _RA, _RS;
  var _beta = 1;
  var _overlapFactor = 1.1;
  var _windowType = "Lanczos";
  var _window;
  var _squaredFramingWindow;

  this.set_alpha(1);

  var _midBuffer = new Float32Array(_frameSize - _RS);
  
  this.set_beta(_beta);

  var _overlapBuffers = create_constant_array(_frameSize, 0, Array);
  var _owOverlapBuffers = create_constant_array(_frameSize, 0, Array);

}
