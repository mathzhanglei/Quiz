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

## 收集成绩

GitHub Pages 自己不能保存提交结果。当前页面提供两种本地结果交付方式：

1. 学生交卷后点击「导出结果」，生成个人 CSV 成绩文件
2. 学生交卷后点击「复制摘要」，把姓名、学号、分数、用时和逐题作答记录复制出来

如果要集中汇总全班成绩，可以让学生提交导出的 CSV 文件，或把复制摘要粘贴到老师指定的收集入口。

## 老师统计

打开 `stats.html` 可以统计全班答题情况。把成绩表的 `Results` 工作表导出为 CSV，然后在统计页选择该 CSV 文件。统计页会显示提交人数、平均分、分数分布、学生成绩表、每题正确率和每题选项分布。

如果要免下载上传，可以在收集脚本里设置 `STATS_TOKEN` 并重新部署 Web App。之后老师打开 `stats.html`，输入统计口令，点击「自动读取」即可直接统计 `Results` 里的提交记录。CSV 上传仍保留为备用方式。

## 学生回看

学生交卷后，页面会把最近 8 次作答保存在当前浏览器里。之后同一台手机、同一个浏览器再次打开考试页，可以在首页的「历史记录」里查看做过的题和错题。清理浏览器缓存、换手机或换浏览器后，本机历史记录不会保留。
