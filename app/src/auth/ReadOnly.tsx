import { createContext, useContext } from 'react';

/**
 * 閲覧専用の教員 (role: viewer) の画面かどうか。true のあいだは、編集のボタン・入力欄を出さない。
 * 変更は、セキュリティルールでも禁止している (画面で隠すのは、押しても失敗する操作を見せないため)。
 */
export const ReadOnlyContext = createContext(false);
export const useReadOnly = () => useContext(ReadOnlyContext);
