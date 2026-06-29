# 复变函数在线练习

这是一个放在 GitHub Pages 上使用的静态答题系统，支持 TeX/LaTeX 公式、微信扫码答题、自动判分、错题回看、二维码索引和 Supabase 成绩统计。

当前主流程：

1. 老师把题库 CSV 放进 `question-sets/`
2. 打开二维码索引页，复制或下载每套题的二维码
3. 学生扫码答题并交卷
4. 成绩自动提交到 Supabase
5. 老师在统计页查看分数分布、错题排行和逐题统计

注意：GitHub Pages 是静态网页，题目和答案会随前端文件发布。适合课堂练习、作业自测和随堂测验；如果是严格考试，需要单独做服务端判分。

## 常用入口

线上二维码索引页：

```text
https://mathzhanglei.github.io/Quiz/qrcodes.html
```

线上答题链接示例：

```text
https://mathzhanglei.github.io/Quiz/?set=1
https://mathzhanglei.github.io/Quiz/?set=2
https://mathzhanglei.github.io/Quiz/?set=10
```

线上统计链接示例：

```text
https://mathzhanglei.github.io/Quiz/stats.html?set=1
https://mathzhanglei.github.io/Quiz/stats.html?set=10
```

本地预览：

```bash
python3 -m http.server 8765
```

如果 `8765` 被占用，可以换成 `8766`、`8767` 等其他端口。

然后打开：

```text
http://127.0.0.1:8765/qrcodes.html
http://127.0.0.1:8765/index.html?set=1
http://127.0.0.1:8765/stats.html?set=1
```

## 文件结构

```text
index.html              学生答题页
qrcodes.html            二维码索引页
stats.html              老师统计页
questions.js            全局设置
app.js                  答题逻辑
qrcodes.js              二维码索引逻辑
stats.js                统计逻辑
styles.css              页面样式
supabase/schema.sql     Supabase 建表和函数
question-sets/          题库 CSV 文件夹
```

编号题库统一放在 `question-sets/`：

```text
question-sets/questions-1.csv
question-sets/questions-2.csv
question-sets/questions-3.csv
...
question-sets/questions-10.csv
```

`?set=5` 会自动对应 `question-sets/questions-5.csv`，后台统计编号也是 `5`。

## 添加新试题

新增第 11 套题时：

1. 复制一个已有题库，例如把 `question-sets/questions-10.csv` 复制成 `question-sets/questions-11.csv`
2. 在 `question-sets/questions-11.csv` 中替换题目、选项、答案、分值和解析
3. 上传或提交到 GitHub
4. 打开 `qrcodes.html`，点击「重新扫描」
5. 使用第 11 套二维码给学生答题

只要文件名符合 `question-sets/questions-编号.csv`，一般不需要修改 `questions.js`。

## CSV 格式

每个题库 CSV 的第一行固定为：

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

在表格软件里维护题库时，TeX 直接写 `$\frac{1}{2}$`，不用写成 `\\frac`。导出 CSV 后放回 `question-sets/` 即可。

## 二维码索引

打开：

```text
https://mathzhanglei.github.io/Quiz/qrcodes.html
```

二维码索引页会自动扫描 `question-sets/questions-1.csv`、`questions-2.csv`、`questions-3.csv` 等实际存在的文件，并为每一套生成：

- 答题二维码
- 答题链接
- 打开答题按钮
- 复制链接按钮
- 下载二维码按钮
- 统计入口

如果新增了题库但页面没显示，点击「重新扫描」。如果仍然没显示，检查文件名是否符合 `questions-编号.csv`。

## 学生答题

学生扫码打开对应题目后：

1. 填写姓名和学号
2. 点击「开始答题」
3. 完成后点击「交卷」
4. 页面自动判分并显示错题回看
5. 成绩自动提交到 Supabase

如果网络临时无法提交，学生可以点击：

- 「下载成绩文件」：生成个人 CSV 成绩文件
- 「复制提交内容」：复制成绩摘要给老师备用
- 「二维码索引」：回到二维码索引页选择下一套题

学生交卷后，最近 8 次作答会保存在当前浏览器里。换手机、换浏览器或清理缓存后，本机历史记录不会保留。

## 老师统计

统计页：

```text
https://mathzhanglei.github.io/Quiz/stats.html?set=1
```

老师输入统计口令后点击「自动读取」，可以看到：

- 提交人数
- 平均分
- 分数分布
- 学生成绩表
- 错题排行
- 每题正确率
- 每题选项分布

清空数据：

- 「清空第几套」输入 `4`，点击「清空选定」：只删除第 4 套提交
- 点击「清空全部」：删除全部提交

两种清空都需要统计口令，并会要求再次输入确认文字。

CSV 上传仍保留为备用方式：把学生提交的个人 CSV 成绩文件拖进统计页即可。

## Supabase 后台

GitHub Pages 自己不能保存提交结果。本项目使用 Supabase 保存成绩。

### 1. 建表和函数

在 Supabase 新建项目后，进入 `SQL Editor`，把 `supabase/schema.sql` 的内容整段粘贴进去运行一次。

然后把统计口令改成自己的：

```sql
update public.quiz_settings
   set value = '这里换成你的统计口令', updated_at = now()
 where key = 'stats_token';
```

这个口令只给老师自己用，不发给学生。

### 2. 填配置

在 Supabase 的 `Project Settings` -> `API` 里复制：

- `Project URL`
- `anon public key`

填到 `questions.js`：

```js
settings: {
  submitProvider: "supabase",
  supabaseUrl: "https://你的项目编号.supabase.co",
  supabaseAnonKey: "你的 anon public key",
  statsProvider: "supabase",
  statsRpcName: "quiz_results_for_stats",
  clearRpcName: "quiz_clear_results_for_set"
}
```

`anon public key` 可以放在网页里。数据库已开启 RLS，匿名访问只能新增成绩，不能直接读取全班成绩。

### 3. 测试

1. 打开 `index.html?set=1`
2. 用测试姓名交卷
3. 回到 Supabase 的 `Table Editor` -> `quiz_results`
4. 确认出现一行新记录
5. 打开 `stats.html?set=1`
6. 输入统计口令并点击「自动读取」

## GitHub Pages 部署

1. 上传本目录文件到 GitHub 仓库
2. 进入仓库 `Settings` -> `Pages`
3. `Build and deployment` 选择 `Deploy from a branch`
4. 选择 `main` 分支和 `/root`
5. 等 GitHub 给出 Pages 地址
6. 打开 `https://mathzhanglei.github.io/Quiz/qrcodes.html`

## 常用设置

常用设置在 `questions.js`：

- `meta.title`：测验标题
- `meta.course`：课程名
- `meta.timeLimitMinutes`：限时分钟数，`0` 表示不限时
- `settings.defaultSet`：默认试卷编号
- `settings.autoQuestionSetPattern`：编号题库文件名规则
- `settings.shuffleQuestions`：是否打乱题目
- `settings.shuffleOptions`：是否打乱选项
- `settings.showCorrectAnswers`：交卷后是否显示正确答案
- `settings.supabaseUrl`：Supabase 项目 URL
- `settings.supabaseAnonKey`：Supabase anon public key

## 自定义题库名称

默认编号题库会显示成「第 5 套」。如果某一套需要自定义名称，可以在 `questions.js` 的 `questionSets` 里单独登记：

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
