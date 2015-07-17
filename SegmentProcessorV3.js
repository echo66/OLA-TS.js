/* 
 * params: {frameSize: Number, bpmTimeline: BPMTimeline, initialBPM: Number}
 */
function SegmentProcessorV3(params) {

	var position;
	var midBufferL = [];
	var midBufferR = [];
	var FRAME_SIZE = params.frameSize || 4096;
	var olaL = new OLATS(FRAME_SIZE);
	var olaR = new OLATS(FRAME_SIZE);

	var intervals  = [{ tlStart: 0 }];

	Object.defineProperties(intervals[0], {
		"start": {
			get: function() { return Math.round(bpmTimeline.time(this.tlStart) * 44100); }
		},
		"end": {
			get: function() { 
				if (this.segDuration != undefined)
					return Math.round(bpmTimeline.time(this.tlStart + this.segDuration) * 44100); 
				else
					return undefined
			}
		},
		"duration": {
			get: function() { 
				var end = this.end;
				if (end != undefined)
					return this.end - this.start; 
				else
					return Number.MAX_VALUE;
			}
		}
	});

	var currentInterval = 0;
	var il = new Float32Array(FRAME_SIZE);
	var ir = new Float32Array(FRAME_SIZE);
	var zeros = new Float32Array(FRAME_SIZE * 3);
	var audioData = {};
	var currentTime = 0;
	var bpmTimeline = params.bpmTimeline || new BPMTimeline(params.initialBPM);


	this.set_current_time = function(newBeatTime) {

		currentInterval = undefined;
		currentTime = Math.round(bpmTimeline.time(newBeatTime) * 44100);

		for (var i=0; i<intervals.length; i++) {
			if (intervals[i].tlStart > newBeatTime) {
				currentInterval = i-1;
				break;
			}
		}

		if (currentInterval == undefined) {
			currentInterval = intervals.length - 1;
			position = 0;
			return;
		}

		var b0 	 = intervals[currentInterval].segStart;
		var tlt0 = intervals[currentInterval].tlStart;
		var id 	 = intervals[currentInterval].audioId;
		var t0 	 = Math.round(audioData[id].beats[b0][0] * 44100);

		position = t0 + (currentTime - Math.round(bpmTimeline.time(tlt0) * 44100));

	}

	this.get_current_time = function(units) { 
		if (units == undefined || units == "seconds") {
			return currentTime / 44100;
		} else if (units == "beats") {
			return bpmTimeline.beat(currentTime / 44100);
		} else {
			throw "Unsupported time units";
		}
	}


	this.process = function(outputAudioBuffer) {

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

			/*
			 * From the current interval, try to obtain FRAME_SIZE samples. If there are less than 
			 * FRAME_SIZE samples in the current interval, obtain samples from the next intervals.
			 */
			for (var i=currentInterval; inputSamplesCount < FRAME_SIZE && i<intervals.length; i++) {

				if (_position==undefined)
					_position = intervals[i].start;

				var incr = Math.min(FRAME_SIZE - inputSamplesCount, intervals[i].duration);

				if (audioData[intervals[i].audioId]) {
					var buffer = audioData[intervals[i].audioId].buffer;
					il.set(buffer.getChannelData(0).subarray(_position, _position + incr), inputSamplesCount);
					ir.set(buffer.getChannelData(1).subarray(_position, _position + incr), inputSamplesCount);
					midAlpha += (incr/FRAME_SIZE) * (intervals[i].bpm / bpmTimeline.bpm_at_time(currentTime + incr));
				} else {
					il.set(zeros.subarray(0, incr), inputSamplesCount);
					ir.set(zeros.subarray(0, incr), inputSamplesCount);
					midAlpha += (incr/FRAME_SIZE) * 1
				}

				

				inputSamplesCount += incr;

				_position = undefined;

			}

			/*
			 * If there are no
			 */
			if (inputSamplesCount < FRAME_SIZE) {
				il.set(zeros.subarray(0, FRAME_SIZE - inputSamplesCount), inputSamplesCount);
				ir.set(zeros.subarray(0, FRAME_SIZE - inputSamplesCount), inputSamplesCount);
			}

			var alpha = midAlpha;
			olaL.set_alpha(alpha);
			olaR.set_alpha(alpha);

			if (olaL.is_clean()) {
				olaL.process(il);
				olaR.process(ir);
			} else {
				midBufferL = midBufferL.concat(olaL.process(il));
				midBufferR = midBufferR.concat(olaR.process(ir));
			}

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

	
	/*
	 * params: { segId: String, tlStart: Number (beat), segStart: Number (beat), segEnd: Number (beat) }
	 */
	this.add_interval = function(params) {

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
					// When both intervals have the same size, start and end, remove the old one.
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

					var obj = {
						tlStart: p.tlStart + p.segDuration, 
						segStart: intervals[i-1].segStart, 
						segDuration: intervals[i].tlStart - p.tlStart + p.segDuration, 
						segId: intervals[i-1].segId, 
						audioId: intervals[i-1].audioId, 
						bpm: intervals[i-1].bpm
					};

					Object.defineProperties(obj, {
						"start": {
							get: function() { return Math.round(audioData[this.audioId].beats[this.segStart][0] * 44100); }
						},
						"end": {
							get: function() { return Math.round(audioData[this.audioId].beats[this.segStart + this.segDuration][0] * 44100); }
						},
						"duration": {
							get: function() { return this.end - this.start; }
						}
					});

					intervals.splice(i, 0, obj);

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

		var obj0 = {
			tlStart  	: p.tlStart, 
			segStart    : p.segStart, 
			segDuration : p.segDuration, 
			segId    	: p.segId, 
			audioId  	: p.audioId, 
			bpm 		: p.bpm, 
		};

		Object.defineProperties(obj0, {
			"start": {
				get: function() { 
					return Math.round(audioData[this.audioId].beats[this.segStart][0] * 44100); 
				}
			},
			"end": {
				get: function() { 
					return Math.round(audioData[this.audioId].beats[this.segStart + this.segDuration][0] * 44100); 
				}
			},
			"duration": {
				get: function() { 
					return this.end - this.start; 
				}
			}
		});


		if (I == undefined) {

			intervals[i-1].segDuration = p.tlStart - intervals[i-1].tlStart;

			var obj1 = { tlStart : p.tlStart + p.segDuration };

			Object.defineProperties(obj1, {
				"start": {
					get: function() { return Math.round(bpmTimeline.time(this.tlStart) * 44100); }
				},
				"end": {
					get: function() { 
						if (this.segDuration != undefined)
							return Math.round(bpmTimeline.time(this.tlStart + this.segDuration) * 44100); 
						else
							return undefined
					}
				},
				"duration": {
					get: function() { 
						var end = this.end;
						if (end != undefined)
							return this.end - this.start; 
						else
							return Number.MAX_VALUE;
					}
				}
			});

			intervals.splice(intervals.length, numToRemove, obj0);

			intervals.splice(intervals.length, 0, obj1);

		} else {

			intervals.splice(I, numToRemove, obj0);

		}
		

	}

	this.remove_interval = function(index) {
		// TODO
	}


	this.get_intervals = function() {
		var _intervals = new Array();

		for (var i=0; i<intervals.length; i++) {
			if (intervals[i].audioId != undefined) {
				_intervals[_intervals.length] = {};
				for (var k in intervals[i]) 
					_intervals[_intervals.length-1][k] = intervals[i][k];
			}
		}

		return _intervals;
	}


	/*
	 * params: {id, audioBuffer, beats} 
	 * "audioBuffer" is an AudioBuffer. 
	 * "beats" is an Array where each entry is another Array with the following data:
	 * [TIME, BPM]
	 */
	this.add_audio_data = function(params) {
		audioData[params.id] = {
			buffer: params.audioBuffer, 
			beats : params.beats
		};
	}

	this.remove_audio_data = function(id) {

		if (audioData[id]) {

			delete audioData[id];

			var _intervals = this.get_intervals();

			intervals = new Array({ tlStart: 0, segStart: 0 });

			for (var i=0; i<_intervals.length; i++) {
				if (_intervals[i].audioId != id) {
					this.add_interval({
						segId: _intervals[i].segId, 
						audioId: _intervals[i].audioId, 
						tlStart: _intervals[i].tlStart, 
						segStart: _intervals[i].segStart, 
						segDuration: _intervals[i].segDuration
					})
				}
			}

			this.set_current_time(bpmTimeline.beat(currentTime));

		}
		
	}

}