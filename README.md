# TeX 单选测验

一个可以放到 GitHub Pages 的静态答题页，支持 TeX/LaTeX 公式、微信扫码答题、自动判分、导出成绩。

## 怎么批改

题库优先从 `question-sets/questions.csv` 读取。每一行题目都有 `答案` 和 `分值`：

```csv
编号,题干,A,B,C,D,答案,分值,启用,解析
q1,"设 $f(x)=x^2+3x$，则 $f'(x)$ 等于？",$x+3$,$2x+3$,$x^2+3$,$2x$,B,5,是,"按幂函数求导和线性法则，$f'(x)=2x+3$。"
```

学生点击「交卷」后，`app.js` 会把学生选择和标准答案比对，自动算总分、正确题数、错题回看。TeX 公式由 MathJax 渲染。

注意：纯 GitHub Pages 是静态网页，答案在前端文件里。适合课堂练习和作业自测；如果是正式考试，需要服务端判分。

## 用表格维护题目

推荐用在线表格维护题库，然后导出 CSV 放到这个仓库。

表格第一行用这些列名：

```csv
编号,题干,A,B,C,D,答案,分值,启用,解析
```

示例：

```csv
q1,"设 $f(x)=x^2+3x$，则 $f'(x)$ 等于？",$x+3$,$2x+3$,$x^2+3$,$2x$,B,5,是,"按幂函数求导和线性法则，$f'(x)=2x+3$。"
```

在表格里 TeX 直接写 `$\frac{1}{2}$`，不用写成 `\\frac`。导出 CSV 后覆盖仓库里的 `question-sets/questions.csv`，网页会优先读取它。

`启用` 写 `否`、`0`、`false`、`停用` 时，这一行会被跳过。答案可以写 `A`、`B`、`C`，也可以写 `选项B`。

`解析` 会在学生交卷后的回看页面显示，支持 TeX 公式。

## 修改设置

常用设置在 `questions.js`：

- `meta.title`：测验标题
- `meta.course`：课程/班级名
- `meta.timeLimitMinutes`：限时分钟数，`0` 表示不限时
- `settings.questionSource`：题库 CSV 路径，默认 `./question-sets/questions.csv`
- `settings.defaultSet`：默认试卷编号
- `settings.shuffleQuestions`：是否打乱题目
- `settings.shuffleOptions`：是否打乱选项
- `settings.showCorrectAnswers`：交卷后是否显示正确答案
- `settings.autoQuestionSetPattern`：编号题库文件名规则，默认 `./question-sets/questions-{set}.csv`
- `settings.supabaseUrl`：Supabase 项目的 Project URL
- `settings.supabaseAnonKey`：Supabase 项目的 anon public key

答案可以写 `"A"`、`"B"`、`"C"`，也可以写选项下标。建议用字母。

## 添加新试题

推荐用编号管理多套题。一套题对应一个 CSV 文件：

```text
questions-1.csv
questions-2.csv
questions-3.csv
...
questions-50.csv
```

这些文件都放在 `question-sets/` 文件夹里：

```text
question-sets/questions-1.csv
question-sets/questions-2.csv
question-sets/questions-3.csv
```

新增第 5 套题时，只需要：

1. 复制一个已有题库文件，例如把 `question-sets/questions-1.csv` 复制成 `question-sets/questions-5.csv`
2. 在 `question-sets/questions-5.csv` 里替换题目、选项、答案、分值和解析
3. 上传或提交到 GitHub
4. 打开 `qrcodes.html`，复制或下载第 5 套二维码
5. 学生扫码答题，老师使用 `stats.html?set=5` 看统计

第 5 套学生链接：

```text
https://mathzhanglei.github.io/Quiz/?set=5
```

第 5 套老师统计链接：

```text
https://mathzhanglei.github.io/Quiz/stats.html?set=5
```

本地测试链接：

```text
http://127.0.0.1:8765/index.html?set=5
http://127.0.0.1:8765/stats.html?set=5
```

只要文件名符合 `question-sets/questions-编号.csv`，一般不需要再改 `questions.js`。网页会自动把 `?set=5` 对应到 `question-sets/questions-5.csv`，并把这套题的后台编号记为 `5`。

Supabase 仍然只需要一张 `quiz_results` 表，不需要为 50 套题建 50 张表。每次提交会自动保存 `question_set`，所以不同套题会分开统计；统计页可以按题库编号清空，也可以清空全部提交。

### CSV 格式

每个 `question-sets/questions-N.csv` 第一行都用这些列名：

```csv
编号,题干,A,B,C,D,答案,分值,启用,解析
```

示例：

```csv
q1,"设 $f(x)=x^2+3x$，则 $f'(x)$ 等于？",$x+3$,$2x+3$,$x^2+3$,$2x$,B,5,是,"按幂函数求导和线性法则，$f'(x)=2x+3$。"
```

说明：

- `编号`：同一套题内唯一即可，例如 `q1`、`q2`
- `题干`：支持 TeX，例如 `$e^z$`
- `A`、`B`、`C`、`D`：选项；判断题可以只写 A/B
- `答案`：写 `A`、`B`、`C` 等
- `分值`：不写时按 1 分处理
- `启用`：写 `否`、`0`、`false`、`停用` 时会跳过该题
- `解析`：交卷后显示，支持 TeX

### 二维码

打开二维码索引页：

```text
https://mathzhanglei.github.io/Quiz/qrcodes.html
```

本地测试时打开：

```text
http://127.0.0.1:8765/qrcodes.html
```

这个页面会自动扫描 `question-sets/questions-1.csv`、`question-sets/questions-2.csv`、`question-sets/questions-3.csv`……只显示实际存在的题库，并为每一套生成对应二维码。

不同套题对应不同链接，所以二维码也不同。例如：

```text
第 1 套：https://mathzhanglei.github.io/Quiz/?set=1
第 2 套：https://mathzhanglei.github.io/Quiz/?set=2
第 50 套：https://mathzhanglei.github.io/Quiz/?set=50
```

一般不需要再手工保存二维码图片；需要打印或发群时，在 `qrcodes.html` 里点击「下载二维码」即可。下载后的图片可以放进 `question-sets/`，命名为：

```text
quiz-1-qr.png
quiz-2-qr.png
quiz-50-qr.png
```

### 自定义标题

如果某一套不想显示成「第 5 套」，可以在 `questions.js` 的 `questionSets` 里单独登记：

```js
questionSets: {
  midterm: {
    label: "期中练习",
    title: "复变函数期中练习",
    questionSource: "./question-sets/questions-midterm.csv"
  }
}
```

学生链接就是：

```text
https://mathzhanglei.github.io/Quiz/?set=midterm
```

编号方式示例：

- 第三套：`https://mathzhanglei.github.io/Quiz/?set=3`
- 第四套：`https://mathzhanglei.github.io/Quiz/?set=4`

## 放到 GitHub Pages

1. 新建一个 GitHub 仓库，例如 `tex-quiz`
2. 上传本目录里的文件
3. 进入仓库 `Settings` → `Pages`
4. `Build and deployment` 选择 `Deploy from a branch`
5. 选择 `main` 分支和 `/root`
6. 等 GitHub 给出 Pages 地址
7. 打开 `https://mathzhanglei.github.io/Quiz/qrcodes.html`，下载或复制各套题的二维码

## Supabase 后台

GitHub Pages 自己不能保存提交结果。推荐用 Supabase 做后台：学生交卷后自动写入 `quiz_results` 表，老师打开统计页输入统计口令即可自动读取错题排行。

### 1. 建表

在 Supabase 新建项目后，进入 `SQL Editor`，把 `supabase/schema.sql` 的内容整段粘贴进去运行一次。

然后把统计口令改成自己的：

```sql
update public.quiz_settings
   set value = '这里换成你的统计口令', updated_at = now()
 where key = 'stats_token';
```

这个口令只给老师自己用，不发给学生。

### 2. 填配置

在 Supabase 的 `Project Settings` → `API` 里复制：

- `Project URL`
- `anon public key`

填到 `questions.js`：

```js
settings: {
  submitProvider: "supabase",
  supabaseUrl: "https://你的项目编号.supabase.co",
  supabaseAnonKey: "你的 anon public key",
  statsProvider: "supabase",
  statsRpcName: "quiz_results_for_stats"
}
```

`anon public key` 可以放在网页里。数据库已经开启 RLS，匿名访问只能新增成绩，不能直接读取全班成绩。

### 3. 测试

1. 打开考试页，随便用一个测试姓名交卷
2. 回到 Supabase 的 `Table Editor` → `quiz_results`，应该能看到一行新记录
3. 打开 `stats.html?set=3` 或 `stats.html?set=4`
4. 输入刚才设置的统计口令，点击「自动读取」
5. 如需重测，在「清空第几套」里输入编号，例如 `3`，点击「清空选定」；也可以点击「清空全部」

## 本地备用提交

如果学生网络临时连不上 Supabase，页面仍然提供两种本地结果交付方式：

1. 学生交卷后点击「下载成绩文件」，生成个人 CSV 成绩文件
2. 学生交卷后点击「复制提交内容」，把姓名、学号、分数、用时和逐题作答记录复制出来

老师可以把这些 CSV 文件拖进 `stats.html` 做统计。

## 老师统计

打开 `stats.html` 可以统计全班答题情况。配置 Supabase 后，输入统计口令并点击「自动读取」，统计页会显示提交人数、平均分、分数分布、学生成绩表、错题排行、每题正确率和每题选项分布。

「清空选定」会按输入的题库编号删除对应提交，例如输入 `4` 只清空第 4 套数据。「清空全部」会删除所有题库编号的提交。两种操作都需要统计口令，并会要求再次输入确认文字。

CSV 上传仍保留为备用方式：把学生提交的个人 CSV 成绩文件拖进统计页即可。

## 学生回看

学生交卷后，页面会把最近 8 次作答保存在当前浏览器里。之后同一台手机、同一个浏览器再次打开考试页，可以在首页的「历史记录」里查看做过的题和错题。清理浏览器缓存、换手机或换浏览器后，本机历史记录不会保留。
