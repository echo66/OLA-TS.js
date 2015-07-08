function SegmentProcessorV3(params) {

	var position = 0;
	var midBufferL = [];
	var midBufferR = [];
	var olaL = new OLATS(params.frameSize);
	var olaR = new OLATS(params.frameSize);
	var FRAME_SIZE = params.frameSize;
	var intervals  = [{ tlStart: 0 }];
	var currentInterval;
	var il = new Float32Array(FRAME_SIZE);
	var ir = new Float32Array(FRAME_SIZE);
	var zeros = new Float32Array(FRAME_SIZE * 2);
	var audioBuffers = {};
	var currentTime = 0;
	var newCurrentTime;
	var bpmTimeline = params.bpmTimeline || new BPMTimeline(params.initialBPM);


	this.set_current_time = function(newTime) {
		// TODO
	}


	this.process = function(outputAudioBuffer) {

		if (newCurrentTime != undefined) {
			// TODO
		}	

		// If no intervals to be played are specified, no need to process anything.
		if (intervals.length == 0 || currentInterval >= intervals.length) {
			outputAudioBuffer.getChannelData(0).set(zeros.subarray(0, outputAudioBuffer.length), 0);
			outputAudioBuffer.getChannelData(1).set(zeros.subarray(0, outputAudioBuffer.length), 0);
			currentTime += outputAudioBuffer.length;
			return;
		}

		while (midBufferL.length <= outputAudioBuffer.length && midBufferR.length <= outputAudioBuffer.length) {

			if (position==undefined) 
				position = intervals[currentInterval].start;

			var midAlpha = 0;

			var inputSamplesCount = 0;

			var _position = position;

			for (var i=currentInterval; inputSamplesCount < FRAME_SIZE && i<intervals.length; i++) {

				if (_position==undefined)
					_position = intervals[i].start;

				var buffer = audioBuffers[intervals[i].audioId];

				var incr = Math.min(FRAME_SIZE - inputSamplesCount, intervals[i].end - intervals[i].start);
				il.set(buffer.getChannelData(0).subarray(_position, _position + incr), inputSamplesCount);
				ir.set(buffer.getChannelData(1).subarray(_position, _position + incr), inputSamplesCount);

				midAlpha += (incr/FRAME_SIZE) * (intervals[i].bpm / bpmTimeline.bpm_at_time(currentTime + incr));

				inputSamplesCount += incr;

				_position = undefined;

			}

			il.set(zeros.subarray(0, FRAME_SIZE - inputSamplesCount), inputSamplesCount);
			ir.set(zeros.subarray(0, FRAME_SIZE - inputSamplesCount), inputSamplesCount);

			var alpha = midAlpha;
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
					// Cleaning OLATS buffers and the output mid buffers is a good idea because 
					// to avoid certain problems with artifacts.
					// "But what are the artifacts???", the young & innocent mind might ask. 
					// Experimentation and mistery are part of our lifes.
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

		for (var i=0; i<outputAudioBuffer.length; i++, currentTime++) {
			ol[i] = midBufferL.shift();
			or[i] = midBufferR.shift();
		}

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
		
		intervals.splice(i, 0, {
			start: params.start, 
			end: params.end, 
			bpm: params.bpm, 
			segId: params.segId, 
			audioId: params.audioId
		});

		if (intervals.length == 1) {
			currentInterval = 0;
			position = intervals[0].start;
		}
	}

	this.add_interval_v2 = function(params) {

		var p = params;

		if (params.tlStart < 0)
			throw "tlStart is below 0";

		var numToRemove = 0;

		var I;

		var done = false;

		for (var i=0; !done && i<intervals.length; i++) {

			if (intervals[i].tlStart == p.tlStart) {

				I = i

				var newSegEnd = p.tlStart + p.segDuration;
				var oldSegEnd = intervals[i].tlStart + intervals[i].segDuration; 

				if (newSegEnd == oldSegEnd) {

					numToRemove = 1;

					done = true;

				} else if (newSegEnd < oldSegEnd) {

					intervals[i].tlStart = newSegEnd;

					numToRemove = 0;

					done = true;

				} else if (newSegEnd > oldSegEnd) {
					
					numToRemove++;

					for (var j=i+1; !done && j<intervals.length; j++) {

						var oldSegEnd = intervals[j].tlStart + intervals[j].segDuration;

						if (newSegEnd > oldSegEnd) {

							numToRemove++;

						} else if (newSegEnd == oldSegEnd) {

							numToRemove++;

							done = true;

						} else if (newSegEnd < oldSegEnd) {

							intervals[j].tlStart = newSegEnd;

							done = true;

						} else {

							intervals[j].tlStart = newSegEnd

							done = true;

						}

					}


				} else {

					intervals[i].tlStart = newSegEnd;

					numToRemove = 0;

					done = true;

				}

			} else if (intervals[i].tlStart > p.tlStart) {

				intervals[i-1].segDuration = p.tlStart - intervals[i-1].tlStart;

				I = i;

				if (p.tlStart + p.segDuration < intervals[i].tlStart) {

					intervals.splice(i, 0, {
						tlStart: p.tlStart + p.segDuration, 
						segStart: intervals[i-1].segStart, 
						segDuration: intervals[i].tlStart - p.tlStart + p.segDuration, 
						segId: intervals[i-1].segId, 
						audioId: intervals[i-1].audioId, 
						bpm: intervals[i-1].bpm
					});

					numToRemove = 0;

					done = true;

				} else if (p.tlStart + p.segDuration == intervals[i].tlStart) {

					numToRemove = 0;

					done = true;

				} else if (p.tlStart + p.segDuration > intervals[i].tlStart) {

					for (var j=i+1; !done && j<intervals.length; j++) {

						var oldSegEnd = intervals[j].tlStart + intervals[j].segDuration;

						if (newSegEnd > oldSegEnd) {

							numToRemove++;

						} else if (newSegEnd == oldSegEnd) {

							numToRemove++;

							done = true;

						} else if (newSegEnd < oldSegEnd) {

							intervals[j].tlStart = newSegEnd;

							done = true;

						} else {

							intervals[j].tlStart = newSegEnd

							done = true;

						}

					}

				}

			}

		}


		if (I == undefined) {

			intervals[i-1].segDuration = p.tlStart;

			intervals.splice(intervals.length, numToRemove, {
				tlStart  	: p.tlStart, 
				segStart    : p.segStart, 
				segDuration : p.segDuration, 
				segId    	: p.segId, 
				audioId  	: p.audioId, 
				bpm 		: p.bpm, 
			});

			intervals.splice(intervals.length, 0, { 
				tlStart		: p.tlStart + p.segDuration
			});

		} else {

			intervals.splice(I, numToRemove, {
				tlStart  	: p.tlStart, 
				segStart    : p.segStart, 
				segDuration : p.segDuration, 
				segId    	: p.segId, 
				audioId  	: p.audioId, 
				bpm 		: p.bpm
			});

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

	// params: {id, audioBuffer}
	this.add_audio_data = function(params) {
		audioBuffers[params.id] = params.audioBuffer;
	}

	this.get_audio_data = function() {
		// TODO
	}

	this.remove_audio_data = function(id) {
		// TODO
	}

}