module.exports = {
  run: [
    {
      method: "shell.run",
      params: {
        message: "npm install",
      },
    },
    {
      method: "notify",
      params: {
        html: "God's Eye View installed. Click Start.",
      },
    },
  ],
};
