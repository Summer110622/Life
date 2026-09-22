export const questions = [
  {scene:'SCENE 01',name:'入口 / THE GATE',note:'トワは、あなたの返事を待っている。',kicker:'最初の印象',title:'町に入る前、あなたは何を確認する？',sub:'考えすぎず、いちばん近いものを選んでください。',answers:[['A','出口の場所。戻れるなら、入ってもいい。',{agency:2,control:2,solitude:1}],['B','誰かがいる気配。ひとりでは入りたくない。',{empathy:2,belonging:2,solitude:-1}],['C','音と匂い。町が何を隠しているか知りたい。',{curiosity:3,agency:1}],['D','トワの残量。歩けるなら、進む。',{resilience:3,control:1}]]},
  {scene:'SCENE 01',name:'入口 / THE GATE',note:'「正しさ」は、まだ標識になっていない。',kicker:'記憶の端',title:'知らない場所で、古い鍵を見つけた。',sub:'鍵が開くかどうかは、わかりません。',answers:[['A','まずポケットにしまう。必要になる気がする。',{control:2,resilience:1}],['B','地面に戻す。持ち主が探しているかもしれない。',{empathy:3,belonging:1}],['C','試せそうな扉を全部探す。',{curiosity:3,agency:1}],['D','トワに渡す。彼の記憶かもしれない。',{solitude:-1,empathy:2,belonging:1}]]},
  {scene:'SCENE 02',name:'市場跡 / THE MARKET',note:'人のいない市場にも、値札だけが残っている。',kicker:'交換',title:'喉が渇いた。水は一人分しかない。',sub:'遠くから、別の足音が聞こえます。',answers:[['A','半分を隠す。見つからないようにする。',{control:3,solitude:1}],['B','足音の主を探しにいく。分けられるかもしれない。',{empathy:3,belonging:2}],['C','水を調べる。別の水源を見つける。',{curiosity:2,agency:2}],['D','トワの冷却用に残す。自分は我慢できる。',{resilience:2,empathy:2}]]},
  {scene:'SCENE 02',name:'市場跡 / THE MARKET',note:'選ばなかった答えも、消えずに積もる。',kicker:'沈黙',title:'ナギが、同じ話を三度した。',sub:'彼はあなたの顔を見て、笑います。',answers:[['A','三度目も初めて聞いたように聞く。',{empathy:3,belonging:1}],['B','話を止めて、別のことを質問する。',{agency:2,control:1}],['C','内容より、繰り返す理由を考える。',{curiosity:3,solitude:1}],['D','自分も同じ話をしている気がする。黙る。',{solitude:3,resilience:1}]]},
  {scene:'SCENE 03',name:'時計塔 / THE CLOCK',note:'時間は壊れている。だから、急がなくていい。',kicker:'時間',title:'止まった時計を、動かすべきだと思う？',sub:'針を直せば、何かが戻るかもしれません。',answers:[['A','直す。止まったままにしておけない。',{control:3,agency:1}],['B','触らない。止まった時間にも意味がある。',{solitude:2,curiosity:1}],['C','仕組みを分解して理解する。',{curiosity:3,control:1}],['D','みんなに聞いてから決める。',{belonging:3,empathy:1}]]},
  {scene:'SCENE 03',name:'時計塔 / THE CLOCK',note:'シロは、フードの影で何も言わない。',kicker:'境界線',title:'「見ないで」と言われたものを、見たくなる？',sub:'見れば、相手を傷つけるかもしれません。',answers:[['A','見ない。頼まれたことを守る。',{empathy:2,control:2}],['B','見ないふりをして、気づいていることを伝える。',{empathy:3,agency:1}],['C','なぜ見てはいけないかを聞く。',{curiosity:3}],['D','一度だけ見る。真実を知るほうが大事。',{agency:3,resilience:1}]]},
  {scene:'SCENE 04',name:'廃駅 / THE STATION',note:'ビットの画面には、意味のない笑顔が浮かんでいる。',kicker:'故障',title:'うまくいかないものを、いつまで直す？',sub:'直すほど、壊れていくようにも見えます。',answers:[['A','動くまで続ける。途中でやめるのは嫌いだ。',{resilience:3,control:1}],['B','誰かに助けを求める。ひとりで抱えない。',{belonging:3,empathy:1}],['C','壊れ方を観察して、別の方法を試す。',{curiosity:3,agency:1}],['D','壊れたままでも進める道を探す。',{agency:2,resilience:2}]]},
  {scene:'SCENE 04',name:'廃駅 / THE STATION',note:'スイの黒髪が、夕日の端で揺れる。',kicker:'やさしさ',title:'やさしさは、相手のため？ 自分のため？',sub:'どちらか一方でなくても構いません。',answers:[['A','相手が少し楽になるなら、それでいい。',{empathy:3,belonging:1}],['B','自分が後悔しないためでもある。',{agency:2,control:1}],['C','やさしくできる余裕がある自分でいたい。',{resilience:2,control:1}],['D','やさしさの意味を、まだ決めたくない。',{curiosity:2,solitude:2}]]},
  {scene:'SCENE 05',name:'工場跡 / THE FURNACE',note:'熱のない炉に、名前だけが残っている。',kicker:'重さ',title:'誰かの期待を、どこまで背負う？',sub:'期待は、見えない荷物です。',answers:[['A','持てるだけ持つ。頼られたことを裏切れない。',{empathy:2,resilience:3}],['B','自分の荷物と分けて考える。',{control:3,agency:1}],['C','期待が生まれた理由をたどる。',{curiosity:2,belonging:1}],['D','重いと言う。言葉にすれば変わるかもしれない。',{agency:3,belonging:1}]]},
  {scene:'SCENE 05',name:'工場跡 / THE FURNACE',note:'トワの胸で、小さな音が続いている。',kicker:'壊れ方',title:'自分が壊れていると気づいたら？',sub:'完全に壊れる前なら、まだ間に合う。',answers:[['A','誰にも言わず、使える部分だけで動く。',{solitude:3,resilience:2}],['B','壊れていることを見せる。直してくれる人を探す。',{belonging:3,empathy:1}],['C','原因を記録する。次に壊れないために。',{control:2,curiosity:2}],['D','壊れたままでも、行きたい場所へ行く。',{agency:3,resilience:2}]]},
  {scene:'SCENE 06',name:'町外れ / THE EDGE',note:'出口は、入口と同じ形をしていない。',kicker:'選択',title:'帰る場所が、もうないとしたら？',sub:'それでも「帰る」という言葉は残っています。',answers:[['A','新しく帰れる場所を作る。',{agency:3,belonging:2}],['B','誰かの隣に立つ。場所より、人を選ぶ。',{belonging:3,empathy:2}],['C','ひとりで歩き続ける。町の外を見たい。',{curiosity:2,solitude:3}],['D','ここを帰る場所にする。壊れていても。',{resilience:3,control:1}]]},
  {scene:'SCENE 06',name:'町外れ / THE EDGE',note:'最後の問いだけは、トワがあなたに尋ねる。',kicker:'残響',title:'あなたが最後まで手放さないものは？',sub:'答えは、きっと次の一歩の中にあります。',answers:[['A','自分で決める権利。',{agency:3,control:1}],['B','誰かを思い出せる記憶。',{empathy:2,belonging:2}],['C','まだ知らないものへの好奇心。',{curiosity:3,solitude:1}],['D','何度でも立ち上がる力。',{resilience:3,agency:1}]]}
];


export const characters = [
  { name: 'トワ', file: 'robot-walk-01.png', role: '記憶のない歩行者' },
  { name: 'ナギ', file: 'grandpa.png', role: '若い、古い背中' },
  { name: 'シロ', file: 'minimax.png', role: '沈黙をまとう人' },
  { name: 'ビット', file: 'linux.png', role: '少し抜けた案内人' },
  { name: 'スイ', file: 'seramu.png', role: '灯りを手渡す人' },
];
export const factorNames = { agency:'自分で決める', control:'境界を守る', curiosity:'未知を探る', empathy:'気持ちを汲む', belonging:'人とつながる', solitude:'内側を見つめる', resilience:'続ける力' };
export const archetypes = {
  agency: ['境界を越える人', '誰かの地図だけに頼らず、自分の進む方向を選ぶ場面がありました。自律を守りながら、助けを借りる余地も残せるでしょうか。'],
  control: ['静かな守り手', '安全や境界を確かめる選択が目立ちました。慎重さは大切な資源です。その守りが、望む一歩まで止めていないか確かめてみてください。'],
  curiosity: ['廃墟を読む人', '未知のものを理解しようとする場面がありました。知ることは安心にもつながります。答えが出ないまま大切にできるものは何でしょう。'],
  empathy: ['記憶を運ぶ人', '誰かの気持ちに場所を空ける選択が目立ちました。同じやさしさを、自分の限界にも向けられるでしょうか。'],
  belonging: ['灯りを分ける人', '人とのつながりを足場にする選択がありました。隣にいることと、相手と同じ答えを選ぶことは、別かもしれません。'],
  solitude: ['静かな観測者', '内側を見つめる距離を大切にする場面がありました。ひとりでいる時間が、休息なのか、伝えたいことの保留なのかを考えてみてください。'],
  resilience: ['火種を守る人', '難しさの中でも続けようとする選択が目立ちました。立ち止まることが、次の一歩を守る選択になることもあります。'],
};
