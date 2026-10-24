/** 見出しなどの絵文字。「親しみやすい」トーンのときだけ表示される (落ち着きでは、CSS で隠す)。 */
export const Em = ({ e }: { e: string }) => <span className="em" aria-hidden="true">{e} </span>;
