import {surveyVersion} from '../shared/survey.mjs';
import {surveyDefinitions,surveySourceVersions,statisticsQuestions} from '../shared/surveyHistory.mjs';

export const canReadSurvey = user => ['admin','manager'].includes(user?.survey_role);

export function surveyStatistics(store,version=surveyVersion) {
  const surveyQuestions=statisticsQuestions(version);
  const versions=store.all('SELECT version,COUNT(*) AS total FROM survey_responses GROUP BY version ORDER BY version DESC');
  if(!versions.some(v=>v.version===surveyVersion))versions.unshift({version:surveyVersion,total:0});
  const sources=surveySourceVersions(version);
  const responses=store.all(`SELECT version,answers FROM survey_responses WHERE version IN (${sources.map(()=>'?').join(',')})`,...sources).map(row=>{
    const answers=JSON.parse(row.answers);
    for(const q of surveyQuestions){
      if(!q.options||!answers[q.id]?.selected)continue;
      const original=surveyDefinitions[row.version]?.find(item=>item.id===q.id);
      answers[q.id]={...answers[q.id],selected:[...new Set(answers[q.id].selected.map(index=>q.options.indexOf(original?.options[index])).filter(index=>index>=0))]};
    }
    return answers;
  });
  const total=responses.length;
  return {
    version,total,currentVersion:surveyVersion,allTotal:versions.reduce((sum,v)=>sum+v.total,0),
    versions:versions.map(v=>({...v,available:!!surveyDefinitions[v.version]})),questionDefinitions:surveyQuestions,
    legacyTotal:store.one('SELECT COUNT(*) n FROM survey_responses WHERE version<>?',surveyVersion).n,
    questions:surveyQuestions.map(q=>{
      const answers=responses.map(a=>a[q.id]).filter(a=>a!==undefined);
      if(q.type==='rating'){
        const ratings=answers.filter(a=>typeof a==='number'),unexperienced=answers.filter(a=>a==='unexperienced').length;
        return {id:q.id,answered:answers.length,rated:ratings.length,unexperienced,average:ratings.length?ratings.reduce((sum,n)=>sum+n,0)/ratings.length:null,counts:[1,2,3,4,5].map(n=>ratings.filter(a=>a===n).length)};
      }
      if(q.type==='text')return {id:q.id,answered:answers.filter(a=>a.trim()).length};
      return {id:q.id,answered:answers.length,counts:q.options.map((_,i)=>answers.filter(a=>a.selected.includes(i)).length),otherCount:answers.filter(a=>a.other?.trim()).length};
    })
  };
}

export function surveyComments(store,question,page,pageSize=10,version=surveyVersion) {
  const surveyQuestions=statisticsQuestions(version);
  const q=surveyQuestions.find(q=>q.id===question);
  // Sort by random response ID for stable paging without exposing submission order or identity.
  const sources=surveySourceVersions(version);
  const comments=store.all(`SELECT answers FROM survey_responses WHERE version IN (${sources.map(()=>'?').join(',')}) ORDER BY id`,...sources)
    .map(row=>JSON.parse(row.answers)[q.id]).map(a=>q.type==='text'?a:a?.other).filter(a=>typeof a==='string'&&a.trim());
  const pages=Math.max(1,Math.ceil(comments.length/pageSize)),current=Math.min(page,pages);
  return {comments:comments.slice((current-1)*pageSize,current*pageSize),total:comments.length,page:current,pages};
}
