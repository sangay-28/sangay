const express = require('express');
const path = require('path');
require('dotenv').config();
const app = express();
// the data layer will be a real database in a later lab, so there's nothing to stand in for it here.
// This server's only job right now is to serve the presentation layer.
app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
