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
			// TODO: LANÇAR EXCEPÇÃO
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
			// TODO: LANÇAR EXCEPÇÃO
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
		if (params.id != undefined) {
			// TODO
		} else {
			var startBeat, endBeat;

			if (units == "beats") {
				startBeat = startTime;
				endBeat = endTime;
			} else if (units == "seconds") {
				startBeat = bpmTimeline.beat(startTime);
				endBeat = bpmTimeline.beat(endTime);
			} else {
				// TODO: LANÇAR EXCEPÇÃO
			}

			_add_segment(undefined, undefined, undefined, startBeat, endBeat, undefined, undefined);
		}
	}

	// TODO: permitir segmentos com sub-segmentos (i.e.: batidas dos segmentos)
	this.add_segment = function(id, audioId, bufferStart, bufferEnd, startBeat, endBeat, bpm) {
		_add_segment(audioId, bufferStart, bufferEnd, startBeat, endBeat, bpm, id);
	}

	function _add_segment(audioId, bufferStart, bufferEnd, startBeat, endBeat, bpm, id) {
		if (!audioBuffers[audioId]) {
			// TODO: CRIAR EXCEPÇÕES
		}

		var newSegment = { 
			audioId : audioId, 
			bufferStart : bufferStart, 
			bufferEnd : bufferEnd, 
			startBeat : startBeat, 
			endBeat : endBeat, 
			bpm : bpm, 
			id : id
		};

		var idx = find_index(segments, {startBeat: startBeat}, function(a, b) { return a.startBeat - b.startBeat; });

		if (idx.length == 1) {

			idx = idx[0];

			if (segments[idx].startBeat < startBeat) {
				/*
				 *	ADDING THE NEW SEGMENT AS THE THE LAST ONE. 
				 *  AS SUCH, WE NEED TO ADD A SILENCE SEGMENT 
				 * AFTER THE NEW SEGMENT.
				 */
				segments[segments.length-1].endBeat = startBeat;
				segments[segments.length] = newStartBeatgment;
				segments[segments.length] = {startBeat: endBeat, endBeat: Number.MAX_VALUE};
				return;
			}

			if (segments[idx].endBeat < endBeat) {
				/*
				 * DELETE ALL SEGMENTS FOR WHICH 
				 * newSegment.endBeat >= segment.endBeat.
				 * FOR THE LAST SEGMENT, THE ONE BEING OVERLAPPED 
				 * (newSegment.endBeat < segment.endBeat), CHANGE THE startBeat AND 
				 * bufferStart VALUES.
				 */
				for (var i=idx+1; i<segments.length; i++) {
					if (segments[i].endBeat > newSegment.endBeat) {
						change_start(segments[idx], newSegment);
						break;
					} 
				}
				segments.splice(idx, i-idx, newSegment);
			} else if (segments[idx].endBeat == endBeat) {
				/* ESCREVE POR CIMA */
				segments[idx] = newSegment;
			} else if (segments[idx].endBeat > endBeat) {
				/* ALTERA O TAMANHO DO ANTIGO E INSERE O NOVO ANTES DO ANTIGO */
				change_start(segments[idx], newSegment);
				segments.splice(idx, 0, newSegment);
			}

		} else {

			var pIdx = idx[0];
			var nIdx = idx[1];

			if (segments[pIdx].endBeat > startBeat) {
				/*
				 *	SE O FINAL DO SEG. ANTERIOR FÔR APÓS O FINAL DO NOVO,
				 */
				if (segments[pIdx].endBeat > endBeat) {
					var copy = copy_segment(segments[pIdx]);
					change_end(copy, newSegment);
					change_start(segments[pIdx], newSegment);
					segments.splice(pIdx, 0, copy); 
					segments.splice(pIdx+1, 0, newSegment);
					return;
				} else {
					change_end(segments[pIdx], newSegment);
				}
			}

			if (segments[nIdx].startBeat < endBeat) {
				for (var i=nIdx; i<segments.length; i++) {
					if (segments[i].endBeat > newSegment.endBeat) {
						change_start(segments[i], newSegment);
						break;
					} 
				}
				segments.splice(nIdx, i-nIdx, newSegment);
			} else if (segments[nIdx].startBeat > endBeat) {
				if (audioId != undefined) {
					segments.splice(nIdx++, 0, newSegment);
					segments.splice(nIdx, 0, { startBeat: segments[nIdx].endBeat, endBeat: startBeat });
				} else {
					/* 
					 *	SE FÔR UM SEGMENTO SILENCIOSO, cria 
					 */
					newSegment.startBeat = segments[nIdx].endBeat;
					segments.splice(nIdx, 0, newSegment);
				}
			} else {
				segments.splice(nIdx, 0, newSegment);
			}

		}
	}

	this.add_audio_buffer = function(id, audioBuffer) {
		audioBuffers[id] = { buffer: audioBuffer };
	}

	this.remove_audio_buffer = function(id) {
		if (audioBuffers[id]) {

			delete audioBuffers[id];

			var _segments = this.get_segments();

			segments = new Array({ startBeat: 0 });

			for (var i=0; i<_segments.length; i++) {
				var S = _segments[i];
				if (S.audioId != undefined && S.audioId != id) {
					_add_segment(S.audioId, S.bufferStart, S.bufferEnd, S.startBeat, S.endBeat, S.bpm, S.id);
				}
			}

			this.set_current_time(bpmTimeline.beat(currentTime));

		} else {
			// TODO: CRIAR EXCEPÇÕES
		}
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
}