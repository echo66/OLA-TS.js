function SegmentsSequencer(params) {

	var innerSegmentCursor = 0;
	var midBufferL = [];
	var midBufferR = [];
	var FRAME_SIZE = params.frameSize || 4096;
	var stretcherL = new OLATS(FRAME_SIZE);
	var stretcherR = new OLATS(FRAME_SIZE);

	var segments = [{startBeat: 0, endBeat: Number.MAX_VALUE}];

	var currentSegment = 0;
	var il = new Float32Array(FRAME_SIZE);
	var ir = new Float32Array(FRAME_SIZE);
	var zeros = new Float32Array(FRAME_SIZE * 3);
	var audioBuffers = {};
	var currentTime = 0; // measured in samples.
	var bpmTimeline = params.bpmTimeline || new BPMTimeline(params.initialBPM); 
	var sampleRate = params.sampleRate || 44100;

	this.sss = segments;


	// newTime: Number, units: "beats" | "seconds"
	this.set_current_time = function(newTime, units) {
		currentSegment = undefined;
		var idx;

		if (units == "beats") {
			currentTime = Math.round(bpmTimeline.time(newTime) * sampleRate);
		} else if (units == "seconds") {
			currentTime = Math.round(newTime * sampleRate);
			newTime = bpmTimeline.beat(newTime);
		} else {
			
			throw {
				message: "Invalid units", 
				invalidValues: {
					units: units
				}
			};

		}

		idx = find_index(segments, {startBeat: newTime}, function(a,b) { return a.startBeat - b.startBeat; });

		if (idx.length == 1) {
			currentSegment = idx[0];
			innerSegmentCursor = segments[currentSegment].bufferStart;
		} else {
			var seg = segments[idx[0]];
			var coef = (newTime - seg.startBeat) / (seg.endBeat - seg.startBeat);
			innerSegmentCursor = Math.round(seg.bufferStart + coef * (seg.bufferEnd - seg.bufferStart));
		}
	}

	// units: "beats" | "seconds"
	this.get_current_time = function(units) {
		if (units == "seconds") {
			return currentTime / sampleRate;
		} else if (units == "beats") {
			return bpmTimeline.beat(currentTime / sampleRate);
		} else {
			
			throw {
				message: "Invalid units", 
				invalidValues: {
					units: units
				}
			};

		}
	}

	this.generate_block = function(outputAudioBuffer, units) {

		while (midBufferL.length <= outputAudioBuffer.length && midBufferR.length <= outputAudioBuffer.length) {

			if (innerSegmentCursor == undefined) 
				innerSegmentCursor = segments[currentSegment].bufferStart;

			var midAlpha = 0;

			var inputSamplesCount = 0;

			var _innerSegmentCursor = innerSegmentCursor;

			var curSeg;

			/*
			 * From the current segment, try to obtain FRAME_SIZE samples. If there are less than
			 * FRAME_SIZE samples in the current segment, obtain samples from the next segment.
			 */
			for (var i=currentSegment; inputSamplesCount < FRAME_SIZE && i < segments.length; i++, currentSegment++) {

				curSeg = segments[i];
				
				if (_innerSegmentCursor == undefined)
					_innerSegmentCursor = curSeg.bufferStart || Math.round(bpmTimeline.time(curSeg.startBeat) * sampleRate);

				var incr = Math.min(FRAME_SIZE - inputSamplesCount, curSeg.bufDuration);

				if (audioBuffers[curSeg.audioId] != undefined) {
					/*
					 *	If this segment is not a silent one, fill the input arrays with 
					 *	"incr" samples from this segment.
					 *	The BPM is the one from the segment and will be compared to the 
					 *	master tempo of the BPMTimeline in order to increment "midAlpha".
					 */
					var buffer = audioBuffers[curSeg.audioId].buffer;
					il.set(buffer.getChannelData(0).subarray(_innerSegmentCursor, _innerSegmentCursor + incr), inputSamplesCount);
					ir.set(buffer.getChannelData(1).subarray(_innerSegmentCursor, _innerSegmentCursor + incr), inputSamplesCount);
					inputSamplesCount += incr;
					var masterBPM = bpmTimeline.tempo_at_time((currentTime + inputSamplesCount) / sampleRate);
					midAlpha += (incr/FRAME_SIZE) * (curSeg.bpm / masterTempo);
					_innerSegmentCursor += incr;
				} else {
					/*
					 *	If this segment is a silent one, fill the input arrays with "incr" zeros.
					 *  The BPM is equal to the current BPM in BPMTimeline.
					 */
					il.set(zeros.subarray(0, incr), inputSamplesCount);
					ir.set(zeros.subarray(0, incr), inputSamplesCount);
					inputSamplesCount += incr;
					midAlpha += (incr/FRAME_SIZE) * 1;
				}
				

				/*
				 * If there aren't enough samples in the current segment, 
				 * "_innerSegmentCursor = undefined" in order to use the "bufferStart" 
				 * from the next segment.
				 */

				_innerSegmentCursor = undefined;

			}

			curSeg = segments[currentSegment];

			/*
			 * Apply time stretching to the input frame.
			 */

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

			/*
			 *	Calculate the new inner segment innerSegmentCursor. 
			 */

			var newPosition = innerSegmentCursor + hop;

			if (newPosition > curSeg.bufferEnd || Math.round(bpmTimeline.time(curSeg.endBeat) * sampleRate)) {
				var oldSegmentEnd = segments[currentSegment].end;
				currentSegment++;
				innerSegmentCursor = intervals[currentSegment].bufferStart + newPosition - oldSegmentEnd;
			} else {
				innerSegmentCursor = newPosition;
			}

		}

		/*
		 *	Write to the output audio buffer.
		 */

		var ol = outputAudioBuffer.getChannelData(0);
		var or = outputAudioBuffer.getChannelData(1);

		for (var i=0; i<outputAudioBuffer.length; i++, currentTime++) {
			ol[i] = midBufferL.shift();
			or[i] = midBufferR.shift();
		}

		return this.get_current_time(units);
	}

	// params: {id} || {startTime, endTime, units}
	this.remove_segments = function(params) {
		
		var startBeat, endBeat;

		if (params.units == "beats") {
			startBeat = params.startTime;
			endBeat = params.endTime;
		} else if (params.units == "seconds") {
			startBeat = bpmTimeline.beat(params.startTime);
			endBeat = bpmTimeline.beat(params.endTime);
		} else {
			
			throw {
				message: "Invalid units", 
				invalidValues: {
					units: params.units
				}
			};

		}

		_remove_segments(startBeat, endBeat);
	}

	function _remove_segments(startBeat, endBeat) {
		_add_segment({startBeat: startBeat, endBeat: endBeat});
	}

	// TODO: permitir segmentos com sub-segmentos (i.e.: batidas dos segmentos)
	this.add_segment = function(id, audioId, bufferStart, bufferEnd, startBeat, endBeat, bpm) {
		if (!audioBuffers[audioId]) {
			throw {
				message: "Invalid audio identifier", 
				invalidValues: {
					audioId: audioId
				}
			};
		}

		_add_segment({
			audioId : audioId, id : id, 
			bufferStart : bufferStart, bufferEnd  : bufferEnd, 
			startBeat : startBeat, endBeat : endBeat
		});
	}

	function _add_segment(newSegment) {

		var idx = find_index(segments, {startBeat: newSegment.startBeat}, function(a, b) { return a.startBeat - b.startBeat; });

		if (idx.length == 1) {

			idx = idx[0];

			if (idx != segments.length-1) {
				// INÍCIO DE OUTRO SEGMENTO OU PRIMEIRO
				override_segments(segments, newSegment, idx);
			} else {
				// ÚLTIMO SEGMENTO
				if (idx == segments.length-1) {
					change_end(segments[idx], newSegment);

					if (segments[idx].startBeat == newSegment.startBeat) 
						segments[idx] = newSegment;
					else 
						segments[idx+1] = newSegment;
					
					segments[segments.length] = {startBeat: newSegment.endBeat, endBeat: Number.MAX_VALUE};
				}
			}

			joined_silent_neighbours(segments, (idx-1 < 0)? undefined: idx-1, idx, idx+1);


		} else {

			var pIdx = idx[0];
			var nIdx = idx[1];

			// SOBREPÕEM-SE A DOIS (OU MAIS) SEGMENTOS
			if (newSegment.endBeat < segments[pIdx].endBeat) {
				var copy = copy_segment(segments[pIdx]);
				change_end(segments[pIdx], newSegment);
				change_start(copy, newSegment);
				segments.splice(pIdx+1, 0, copy);
				segments.splice(pIdx+1, 0, newSegment);
				joined_silent_neighbours(segments, pIdx, pIdx+1, pIdx+2);
				return;
			}
			if (newSegment.endBeat == segments[pIdx].endBeat) {
				change_end(segments[pIdx], newSegment);
				segments.splice(pIdx+1, 0, newSegment);
				joined_silent_neighbours(segments, pIdx, pIdx+1, pIdx+2);
				return;
			}
			if (newSegment.endBeat > segments[pIdx].endBeat) {
				change_end(segments[pIdx], newSegment);
				override_segments(segments, newSegment, nIdx);
				joined_silent_neighbours(segments, pIdx, pIdx+1, pIdx+2);
				return;
			}

		}
	}

	this.add_audio_buffer = function(id, audioBuffer) {
		audioBuffers[id] = { buffer: audioBuffer };
	}

	this.remove_audio_buffer = function(aid) {
		if (audioBuffers[aid]) {

			delete audioBuffers[aid];

			var segmentsToRemove = [];

			for (var i=0; i<segments.length; i++) {
				if (segments[i].audioId == aid) {
					segmentsToRemove[segmentsToRemove.length] = {
						startBeat : segments[i].startBeat, 
						endBeat : segments[i].endBeat
					};
				}
			}

			for (var i=0; i<segmentsToRemove.length; i++) {
				_remove_segments(segmentsToRemove[i].startBeat, segmentsToRemove[i].endBeat);
			}

		} else {

			throw {
				message: "Invalid audio identifier", 
				invalidValues: {
					audioId: audioId
				}
			};

		}
	}




	/***************************************************************/
	/********************** HELPER FUNCTIONS ***********************/
	/***************************************************************/
	function copy_segment(seg) {
		var copy = {};
		copy.startBeat = seg.startBeat;
		copy.endBeat = seg.endBeat;
		if (seg.id != undefined) copy.id = seg.id;
		if (seg.bufferStart != undefined) copy.bufferStart = seg.bufferStart;
		if (seg.bufferEnd != undefined) copy.bufferEnd = seg.bufferEnd;
		if (seg.bpm != undefined) copy.bpm = seg.bpm;
		if (seg.audioId != undefined) copy.audioId = seg.audioId;
		return copy;
	}

	function change_start(oldSegment, newSegment) {
		var newStartBeat = newSegment.endBeat;
		oldSegment.startBeat = newStartBeat;

		if (oldSegment.bufferStart == undefined)
			return;

		var oldEndBeat   = oldSegment.endBeat;
		var oldStartBeat = oldSegment.startBeat;
		var oldBufStart  = oldSegment.bufferStart;
		var oldBufEnd    = oldSegment.bufferEnd;
		var coef = (oldEndBeat - newStartBeat) / (oldEndBeat - oldStartBeat);
		var newBufStart = oldBufEnd - (oldBufEnd - oldBufStart) * coef ;
		oldSegment.bufferStart  = newBufStart;
	}

	function change_end(oldSegment, newSegment) {
		var newEndBeat	 = newSegment.startBeat;
		oldSegment.endBeat = newEndBeat;

		if (oldSegment.bufferEnd == undefined)
			return;

		var oldEndBeat   = oldSegment.endBeat;
		var oldStartBeat = oldSegment.startBeat;
		var oldBufStart  = oldSegment.bufferStart;
		var oldBufEnd    = oldSegment.bufferEnd;
		var coef = (newEndBeat - oldStartBeat) / (oldEndBeat - oldStartBeat);
		var newBufEnd = oldBufStart + (oldBufEnd - oldBufStart) * coef ;
		oldSegment.bufferEnd  = newBufEnd;
	}

	function override_segments(segments, newSegment, idx) {
		for (var i=idx; i<segments.length; i++) {
			if (segments[i].endBeat > newSegment.endBeat) {
				change_start(segments[i], newSegment);
				break;
			}
		}
		segments.splice(idx, i-idx, newSegment);
	}

	function joined_silent_neighbours(segments, pi, i, ni) {
		if (segments[i].id != undefined)
			return false;

		if (pi != undefined && ni != undefined && segments[pi].id == undefined && segments[ni].id == undefined) {
			var newSegment = { startBeat: segments[pi].startBeat, endBeat: segments[ni].endBeat };
			segments.splice(pi, 3, newSegment);
			return true;
		} else if (pi != undefined && segments[pi].id == undefined) {
			var newSegment = { startBeat: segments[pi].startBeat, endBeat: segments[i].endBeat };
			segments.splice(pi, 2, newSegment);
			return true;
		} else if (ni != undefined && segments[ni].id == undefined) {
			var newSegment = { startBeat: segments[i].startBeat, endBeat: segments[ni].endBeat };
			segments.splice(i, 2, newSegment);
			return true;
		}
	}




	/***************************************************************/
	/******************* BINARY SEARCH FUNCTIONS *******************/
	/***************************************************************/
	function find_index(values, target, compareFn) {
		if (values.length == 0 || compareFn(target, values[0]) < 0) { 
			return [0]; 
		}
		if (compareFn(target, values[values.length-1]) > 0 ) {
			return [values.length-1];
		}
		return modified_binary_search(values, 0, values.length - 1, target, compareFn);
	}

	function modified_binary_search(values, start, end, target, compareFn) {
		// if the target is bigger than the last of the provided values.
		if (start > end) { return [end]; } 

		var middle = Math.floor((start + end) / 2);
		var middleValue = values[middle];

		if (compareFn(middleValue, target) < 0 && values[middle+1] && compareFn(values[middle+1], target) > 0)
			// if the target is in between the two halfs.
			return [middle, middle+1];
		else if (compareFn(middleValue, target) > 0)
			return modified_binary_search(values, start, middle-1, target, compareFn); 
		else if (compareFn(middleValue, target) < 0)
			return modified_binary_search(values, middle+1, end, target, compareFn); 
		else 
			return [middle]; //found!
	}
}