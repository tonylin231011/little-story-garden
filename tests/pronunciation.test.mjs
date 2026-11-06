import test from 'node:test';
import assert from 'node:assert/strict';
import {pronunciationFeedback} from '../src/pronunciation.js';

test('Pronunciation praise requires both score and completeness',()=>{
 assert.equal(pronunciationFeedback({score:92,completion:1}).title,'Excellent!');
 assert.equal(pronunciationFeedback({score:92,completion:0.3}).level,'retry');
 assert.equal(pronunciationFeedback({score:74,completion:0.8}).title,'Good job!');
 assert.equal(pronunciationFeedback({score:-1,completion:1}).level,'retry');
});
