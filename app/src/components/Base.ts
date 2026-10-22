import { createContext, useContext } from 'react';

/** 学生の画面のリンクの基準パス。通常は空、教員のプレビューでは /teacher/preview/<sid>。 */
export const BaseContext = createContext('');
export const useBase = () => useContext(BaseContext);
