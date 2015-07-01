function OLATS(frameSize, windowType) {

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

  function create_window(length, beta, type) {

    var win = new Float32Array(length);

    // for (var i=0; i<length; i++)
    //   win[i] = Math.pow(Math.sin(Math.PI*i/length), beta);
    for (var i=0; i<length; i++) {
      win[i] = WindowFunctions[type](length, i, beta);
    }

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

  this.set_beta = function(newBeta) {
    _beta = newBeta;
  }

  this.set_overlap = function(newOverlap) {
    _overlapFactor = newOverlap;
  }

  var WindowFunctions = {

    SinBeta : function(length, index, beta) {
      return Math.pow(Math.sin(Math.PI*index/length), beta)
    },

    Bartlett : function(length, index) {
      return 2 / (length - 1) * ((length - 1) / 2 - Math.abs(index - (length - 1) / 2));
    },

    BartlettHann : function(length, index) {
      return 0.62 - 0.48 * Math.abs(index / (length - 1) - 0.5) - 0.38 * Math.cos(2 * Math.PI * index / (length - 1));
    },

    Blackman : function(length, index, alpha) {
      var a0 = (1 - alpha) / 2;
      var a1 = 0.5;
      var a2 = alpha / 2;

      return a0 - a1 * Math.cos(2 * Math.PI * index / (length - 1)) + a2 * Math.cos(4 * Math.PI * index / (length - 1));
    },

    Cosine : function(length, index) {
      return Math.cos(Math.PI * index / (length - 1) - Math.PI / 2);
    },

    Gauss : function(length, index, alpha) {
      return Math.pow(Math.E, -0.5 * Math.pow((index - (length - 1) / 2) / (alpha * (length - 1) / 2), 2));
    },

    Hamming : function(length, index) {
      return 0.54 - 0.46 * Math.cos(2 * Math.PI * index / (length - 1));
    },

    Hann : function(length, index) {
      return 0.5 * (1 - Math.cos(2 * Math.PI * index / (length - 1)));
    },

    Lanczos : function(length, index) {
      var x = 2 * index / (length - 1) - 1;
      return Math.sin(Math.PI * x) / (Math.PI * x);
    },

    Rectangular : function(length, index) {
      return 1;
    },

    Triangular : function(length, index) {
      return 2 / length * (length / 2 - Math.abs(index - (length - 1) / 2));
    }
  };


  var _frameSize = frameSize;
  var _alpha, _RA, _RS;
  var _beta = 15;
  var _overlapFactor = 2.3;

  this.set_alpha(1);

  var _midBuffer = new Float32Array(_frameSize - _RS);
  var _window = create_window(frameSize, _beta, "Lanczos");

  var _squaredFramingWindow = new Float32Array(_window.length);
  for (var i=0; i<_squaredFramingWindow.length; i++) {
    _squaredFramingWindow[i] = Math.pow(_window[i], 1);
  }

  var _overlapBuffers = create_constant_array(_frameSize, 0, Array);
  var _owOverlapBuffers = create_constant_array(_frameSize, 0, Array);




  
  

}
