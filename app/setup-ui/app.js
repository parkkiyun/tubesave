'use strict';
const $=id=>document.getElementById(id),api=window.tubeSaveSetup;
function page(name){for(const id of ['welcome','connect','progress'])$(id).hidden=id!==name;}
function step(name){for(const id of ['auth','build','install'])$('step-'+id).classList.toggle('active',id===name);}
function error(message){$('heading').textContent='잠시 멈췄어요';$('status').textContent=message;$('spinner').hidden=true;$('retry').hidden=false;$('build-note').textContent='기존 앱과 저장한 영상은 그대로 있어요. 오류를 확인한 뒤 다시 시도하세요.';}
$('use').onclick=()=>api.close();$('back').onclick=()=>api.close();$('close').onclick=()=>api.close();$('configure').onclick=()=>page('connect');
$('consent').onchange=()=>{$('start').disabled=!$('consent').checked;};
$('start').onclick=async()=>{if(!$('consent').checked)return;page('progress');$('spinner').hidden=false;step('auth');try{await api.start(true);}catch(e){error(e.message);}};
$('retry').onclick=()=>{page('connect');$('consent').checked=false;$('start').disabled=true;$('retry').hidden=true;$('auth-box').hidden=true;};
$('open-github').onclick=()=>api.openGitHub().catch(e=>error(e.message));
api.onEvent(e=>{
 if(e.type==='auth'){$('auth-box').hidden=false;$('device-code').textContent=e.code;$('spinner').hidden=true;$('status').textContent='GitHub 로그인을 기다리고 있어요.';step('auth');}
 if(e.type==='progress'){$('status').textContent=e.message;if(/빌드|공개키 연결|이미 개인용/.test(e.message)){$('auth-box').hidden=true;$('spinner').hidden=false;step('build');}if(/설치 파일|서명 검증 완료|설치 위치/.test(e.message)){step('install');}}
 if(e.type==='done'){$('heading').textContent='설치 준비가 끝났어요';$('spinner').hidden=true;$('auth-box').hidden=true;$('status').textContent='TubeSave Personal의 설치 또는 실행 창을 확인해 주세요. 앞으로는 Personal 앱을 사용하면 됩니다.';$('build-note').textContent='기존 TubeSave와 영상 파일은 삭제하지 않았어요.';step('install');}
 if(e.type==='error')error(e.message);
});
