function SegmentProcessor(audioData, frameSize) {

  var position = 0;
  var midBufferL = [];
  var midBufferR = [];
  var olaL = new OLATS(frameSize);
  var olaR = new OLATS(frameSize);
  var buffer = audioData;
  var FRAME_SIZE = frameSize;
  var intervals  = [];
  var currentInterval;
  var refBPM;
  var il = new Float32Array(FRAME_SIZE);
  var ir = new Float32Array(FRAME_SIZE);

  this.process = function(outputAudioBuffer) {

    // If no intervals to be played are specified, no need to process anything.
    if (intervals.length == 0 || currentInterval >= intervals.length) {
      var ol = outputAudioBuffer.getChannelData(0);
      var or = outputAudioBuffer.getChannelData(1);
      for (var i=0; i<FRAME_SIZE; i++) {
        ol[i] = or[i] = 0;
      }
      return;
    }

    while (midBufferL.length <= outputAudioBuffer.length && midBufferR.length <= outputAudioBuffer.length) {

      var midBPM = 0;

      var inputSamplesCount = 0;

      var _position = position;

      for (var i=currentInterval; inputSamplesCount < FRAME_SIZE && i<intervals.length; i++) {

        if (_position==undefined)
          _position = intervals[i][0];

        var incr = Math.min(FRAME_SIZE - inputSamplesCount, intervals[i][1] - intervals[i][0]);
        il.set(buffer.getChannelData(0).subarray(_position, _position + incr), inputSamplesCount);
        ir.set(buffer.getChannelData(1).subarray(_position, _position + incr), inputSamplesCount);

        midBPM += (incr/FRAME_SIZE) *  intervals[i][2];

        inputSamplesCount += incr;

        _position = undefined;

      }

      for (var i=inputSamplesCount; i<FRAME_SIZE; i++) {
        il[i] = ir[i] = 0;
      }

      var bpm = (refBPM)? refBPM : midBPM;
      var alpha = midBPM / bpm;
      olaL.set_alpha(alpha);
      olaR.set_alpha(alpha);

      midBufferL = midBufferL.concat(olaL.process(il));
      midBufferR = midBufferR.concat(olaR.process(ir));

      var hop = olaL.get_ra();

      var newPosition = position + hop;

      if (newPosition > intervals[currentInterval][1]) {
        var oldIntervalEnd = intervals[currentInterval][1];
        currentInterval++;
        console.log("next")
        if (intervals[currentInterval]) {
          position = intervals[currentInterval][0] + newPosition - oldIntervalEnd;
        } else {
          position = oldIntervalEnd;
          break;
        }
      } else {
        position = newPosition;
      }

    }

    var ol = outputAudioBuffer.getChannelData(0);
    var or = outputAudioBuffer.getChannelData(1);

    for (var i=0; i<outputAudioBuffer.length; i++) {
      ol[i] = midBufferL.shift();
      or[i] = midBufferR.shift();
    }

  }

  this.clear = function() {
    // TODO
  }

  this.set_current_interval = function(index, pos) {
    currentInterval = index;
    var newPos = Math.min(pos, intervals[index][1]);
    if (newPos != undefined) 
      position = newPos;
    else 
      position = intervals[index][0];
  }

  this.add_interval = function(params) {
    var i = (params.index==undefined)? intervals.length : params.index;
    intervals.splice(i, 0, [params.start, params.end, params.bpm, params.id]);
    if (intervals.length == 1) {
      currentInterval = 0;
      position = intervals[0][0];
    }
  }

  this.remove_interval = function(index) {
    intervals.splice(index,1);
  }

  this.remove_interval_q = function(index) {

  }

  this.get_intervals = function() {
    var _intervals = new Array(intervals.length);

    for (var i=0; i<intervals.length; i++) {
      _intervals[i] = new Array(intervals[i].lengt);
      for (var j=0; j<intervals[i].length; j++) 
        _intervals[i][j] = intervals[i][j];
    }

    return _intervals;
  }

  this.set_audio_data = function(audioData) {
    buffer = audioData;
    position = 0;
    olaL.clear();
    olaR.clear();
    intervals = [];
  }

  this.set_reference_bpm = function(newBPM) {
    refBPM = newBPM;
  }

}