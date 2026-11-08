import {get,set} from 'idb-keyval';
export default {
  getItem: (key:string)=>get<string>(key),
  setItem: (key:string,value:string)=>set(key,value),
};
