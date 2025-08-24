require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose'); 

const port = process.env.PORT || 5000; 

const connectDB = require('./config/db');

const app = express();

app.use(express.json());

connectDB();

app.get('/', (req, res) => {
    res.send('API is working');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});