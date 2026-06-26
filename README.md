# TeX 单选测验

一个可以放到 GitHub Pages 的静态答题页，支持 TeX/LaTeX 公式、微信扫码答题、自动判分、导出成绩。

## 怎么批改

题库优先从 `questions.csv` 读取。每一行题目都有 `答案` 和 `分值`：

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

在表格里 TeX 直接写 `$\frac{1}{2}$`，不用写成 `\\frac`。导出 CSV 后覆盖仓库里的 `questions.csv`，网页会优先读取它。

`启用` 写 `否`、`0`、`false`、`停用` 时，这一行会被跳过。答案可以写 `A`、`B`、`C`，也可以写 `选项B`。

`解析` 会在学生交卷后的回看页面显示，支持 TeX 公式。

## 修改设置

常用设置在 `questions.js`：

- `meta.title`：测验标题
- `meta.course`：课程/班级名
- `meta.timeLimitMinutes`：限时分钟数，`0` 表示不限时
- `settings.questionSource`：题库 CSV 路径，默认 `./questions.csv`
- `settings.defaultSet`：默认试卷编号
- `settings.shuffleQuestions`：是否打乱题目
- `settings.shuffleOptions`：是否打乱选项
- `settings.showCorrectAnswers`：交卷后是否显示正确答案
- `settings.supabaseUrl`：Supabase 项目的 Project URL
- `settings.supabaseAnonKey`：Supabase 项目的 anon public key

答案可以写 `"A"`、`"B"`、`"C"`，也可以写选项下标。建议用字母。

## 按章节出题

一章题对应一个 CSV 文件。例如：

- `questions-chapter3.csv`：第三章
- `questions-chapter4.csv`：第四章

然后在 `questions.js` 里登记：

```js
questionSets: {
  chapter3: {
    label: "第三章",
    title: "复变函数第三章在线练习",
    questionSource: "./questions-chapter3.csv"
  },
  chapter4: {
    label: "第四章",
    title: "复变函数第四章在线练习",
    questionSource: "./questions-chapter4.csv"
  }
}
```

学生链接：

- 第三章：`https://mathzhanglei.github.io/Quiz/?set=chapter3`
- 第四章：`https://mathzhanglei.github.io/Quiz/?set=chapter4`

老师统计：

- 第三章：`https://mathzhanglei.github.io/Quiz/stats.html?set=chapter3`
- 第四章：`https://mathzhanglei.github.io/Quiz/stats.html?set=chapter4`

## 放到 GitHub Pages

1. 新建一个 GitHub 仓库，例如 `tex-quiz`
2. 上传本目录里的文件
3. 进入仓库 `Settings` → `Pages`
4. `Build and deployment` 选择 `Deploy from a branch`
5. 选择 `main` 分支和 `/root`
6. 等 GitHub 给出 Pages 地址
7. 把地址生成二维码，学生用微信扫码打开

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
3. 打开 `stats.html?set=chapter3` 或 `stats.html?set=chapter4`
4. 输入刚才设置的统计口令，点击「自动读取」

## 本地备用提交

如果学生网络临时连不上 Supabase，页面仍然提供两种本地结果交付方式：

1. 学生交卷后点击「下载成绩文件」，生成个人 CSV 成绩文件
2. 学生交卷后点击「复制提交内容」，把姓名、学号、分数、用时和逐题作答记录复制出来

老师可以把这些 CSV 文件拖进 `stats.html` 做统计。

## 腾讯文档收集（备用）

推荐建一个收集表，字段如下：

```text
姓名
学号
章节
成绩摘要
```

其中 `成绩摘要` 用多行文本。学生交卷后点击「复制提交内容」，把复制出来的内容粘贴到 `成绩摘要`，然后提交收集表。

老师从腾讯文档导出 CSV 后，打开 `stats.html` 选择该 CSV，即可看到提交人数、学生成绩和错题排行。

## 老师统计

打开 `stats.html` 可以统计全班答题情况。配置 Supabase 后，输入统计口令并点击「自动读取」，统计页会显示提交人数、平均分、分数分布、学生成绩表、错题排行、每题正确率和每题选项分布。

CSV 上传仍保留为备用方式：从 Supabase 或其他收集入口导出 CSV 后，在统计页选择该 CSV 文件即可。

## 学生回看

学生交卷后，页面会把最近 8 次作答保存在当前浏览器里。之后同一台手机、同一个浏览器再次打开考试页，可以在首页的「历史记录」里查看做过的题和错题。清理浏览器缓存、换手机或换浏览器后，本机历史记录不会保留。
