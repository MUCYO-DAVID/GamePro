// Local / long-running server entry. On Vercel, api/index.js is used instead.
import app from "./app.js";

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`GamePro running on http://localhost:${port}`);
});
