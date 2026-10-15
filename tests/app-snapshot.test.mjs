import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAppSnapshot} from '../src/appSnapshot.mjs';

test('missing survey API does not discard existing users or accepted friendships',async()=>{
  const me={user:{id:'owner'},ai:'local'},people={users:[{id:'friend',relation:'accepted',online:false}]};
  const result=await loadAppSnapshot(async path=>{
    if(path==='/me')return me;
    if(path==='/users')return people;
    throw Object.assign(new Error('missing route'),{status:404});
  });
  assert.deepEqual(result.me,me);
  assert.deepEqual(result.people,people);
  assert.equal(result.survey,undefined);
  assert.equal(result.errors[0].path,'/survey/status');
  assert.equal(result.errors[0].error.status,404);
});

test('failed people request is distinguishable from a genuinely empty list and can be retried',async()=>{
  let failed=true;
  const request=async path=>{
    if(path==='/users'){
      if(failed)throw new Error('connection lost');
      return {users:[]};
    }
    return path==='/me'?{user:{id:'owner'}}:{eligible:false};
  };
  const first=await loadAppSnapshot(request);
  assert.equal(first.people,undefined);
  assert.equal(first.errors[0].path,'/users');
  assert.equal(first.me.user.id,'owner');
  failed=false;
  const retry=await loadAppSnapshot(request);
  assert.deepEqual(retry.people.users,[]);
  assert.deepEqual(retry.errors,[]);
});

test('authentication failures remain available for the caller to end the session',async()=>{
  const result=await loadAppSnapshot(async()=>{throw Object.assign(new Error('login required'),{status:401});});
  assert.equal(result.me,undefined);
  assert.equal(result.people,undefined);
  assert.equal(result.errors.length,3);
  assert.ok(result.errors.every(failure=>failure.error.status===401));
});
