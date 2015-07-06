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

      while (inputSamplesCount < FRAME_SIZE) {

        // Retrieve FRAME_SIZE samples from the audio buffer, 
        // unless the number of remaining samples in the current 
        // interval is smaller than FRAME_SIZE.
        var naturalFrameEnd = position + FRAME_SIZE;
        var frameEnd = Math.min(naturalFrameEnd, intervals[currentInterval][1]);

        il.set(buffer.getChannelData(0).subarray(position, frameEnd));
        ir.set(buffer.getChannelData(1).subarray(position, frameEnd));

        midBPM += ((frameEnd - position) / FRAME_SIZE) * intervals[currentInterval][2];
        // console.log(midBPM);

        inputSamplesCount += frameEnd - position;

        if (frameEnd < naturalFrameEnd) {
          // When we request more samples than the available in the 
          // current interval, if there is another interval in the queue, 
          // copy samples from the start of that next interval and mark 
          // it as the new current interval. Otherwise, fill the remaining 
          // input with zeros.
          currentInterval++;
          if (currentInterval < intervals.length)
            position = intervals[currentInterval][0];
          else 
            break;
        }

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

      var newPosition = position + olaL.get_ra();

      if (intervals[currentInterval] && newPosition > intervals[currentInterval][1]) {
        currentInterval++;
      }

      position = newPosition;

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

  this.add_interval = function(start, end, bpm, index) {
    var i = (index==undefined)? intervals.length : index;
    if (intervals.length == 0)
      currentInterval = 0;
    intervals.splice(i, 0, [start, end, bpm]);
  }

  this.remove_interval = function(index) {
    intervals.splice(index,1);
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