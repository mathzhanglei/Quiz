window.QUIZ_CONFIG = {
  meta: {
    title: "复变函数基础在线考试",
    course: "复变函数",
    teacher: "",
    timeLimitMinutes: 0,
    instructions: "欢迎参加本次在线考试。请注意以下事项：\n· 在考试过程中，请确保网络连接稳定，以免影响考试。\n· 请在规定时间内完成考试，超时将无法提交答案。\n· 考试过程中，请勿抄袭或作弊，否则将取消考试成绩。\n· 如有任何疑问，请联系考试管理员。祝您考试顺利！"
  },
  settings: {
    questionSource: "./questions.csv",
    defaultSet: "default",
    shuffleQuestions: false,
    shuffleOptions: false,
    showCorrectAnswers: true,
    submitEndpoint: "https://script.google.com/macros/s/AKfycbz5pzJNjsuXGrSmqgwpkGeZPntmkHs-EcObh1t7dOu1p7simq8WZLJkHG6isa2BvhBfcw/exec"
  },
  questionSets: {
    default: {
      label: "默认",
      title: "复变函数基础在线考试",
      questionSource: "./questions.csv"
    },
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
  },
  questions: []
};
