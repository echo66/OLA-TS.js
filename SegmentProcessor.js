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
  var zeros = new Float32Array(FRAME_SIZE * 2);

  this.process = function(outputAudioBuffer) {

    // If no intervals to be played are specified, no need to process anything.
    if (intervals.length == 0 || currentInterval >= intervals.length) {
      outputAudioBuffer.getChannelData(0).set(zeros.subarray(0, outputAudioBuffer.length), 0);
      outputAudioBuffer.getChannelData(1).set(zeros.subarray(0, outputAudioBuffer.length), 0);
      return;
    }

    while (midBufferL.length <= outputAudioBuffer.length && midBufferR.length <= outputAudioBuffer.length) {

      if (position==undefined) 
        position = intervals[currentInterval].start;

      var midBPM = 0;

      var inputSamplesCount = 0;

      var _position = position;

      for (var i=currentInterval; inputSamplesCount < FRAME_SIZE && i<intervals.length; i++) {

        if (_position==undefined)
          _position = intervals[i].start;

        var incr = Math.min(FRAME_SIZE - inputSamplesCount, intervals[i].end - intervals[i].start);
        il.set(buffer.getChannelData(0).subarray(_position, _position + incr), inputSamplesCount);
        ir.set(buffer.getChannelData(1).subarray(_position, _position + incr), inputSamplesCount);

        midBPM += (incr/FRAME_SIZE) *  intervals[i].bpm;

        inputSamplesCount += incr;

        _position = undefined;

      }

      il.set(zeros.subarray(0,FRAME_SIZE-inputSamplesCount), inputSamplesCount);
      ir.set(zeros.subarray(0,FRAME_SIZE-inputSamplesCount), inputSamplesCount);

      var bpm = (refBPM)? refBPM : midBPM;
      var alpha = midBPM / bpm;
      olaL.set_alpha(alpha);
      olaR.set_alpha(alpha);

      midBufferL = midBufferL.concat(olaL.process(il));
      midBufferR = midBufferR.concat(olaR.process(ir));

      var hop = olaL.get_ra();

      var newPosition = position + hop;

      if (newPosition > intervals[currentInterval].end) {
        var oldIntervalEnd = intervals[currentInterval].end;
        currentInterval++;
        if (intervals[currentInterval]) {
          position = intervals[currentInterval].start + newPosition - oldIntervalEnd;
        } else {
          position = undefined;
          // Cleaning OLATS buffers and the output mid buffers is a good idea because to avoid certain problems with artifacts.
          // "But what are the artifacts???", the young & innocent mind might ask. Experimentation and mistery are part of our 
          // lifes.
          olaL.clear_buffers();
          olaR.clear_buffers();
          midBufferL = [];
          midBufferR = [];
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
    var newPos = Math.min(pos, intervals[index].start);
    if (!isNaN(newPos) && newPos != undefined) 
      position = newPos;
    else 
      position = intervals[index].start;
  }

  this.add_interval = function(params) {
    var i = (params.index==undefined)? intervals.length : params.index;
    // intervals.splice(i, 0, [params.start, params.end, params.bpm, params.id]);
    intervals.splice(i, 0, {
      start: params.start, 
      end: params.end, 
      bpm: params.bpm, 
      segId: params.id, 
      silence: params.silence || false
    });
    if (intervals.length == 1) {
      currentInterval = 0;
      position = intervals[0].start;
    }
  }

  this.remove_interval = function(index) {
    intervals.splice(index,1);
  }

  this.remove_interval_q = function(selectorToRemoveFn) {
    //TODO
    for (var i=0; i<intervals.length; i++) {
      if (selectToRemoveFn(intervals[i])) {
        //TODO
      }
    }
  }

  this.get_intervals = function() {
    var _intervals = new Array(intervals.length);

    for (var i=0; i<intervals.length; i++) {
      _intervals[i] = {};
      for (var k in intervals[i]) 
        _intervals[i][k] = intervals[i][k];
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