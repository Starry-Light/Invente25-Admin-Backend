const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    pw: {
        type: String,
        required: true
    },
    role: {
        type: String,
        required: true,
        enum: ['superadmin', 'eventadmin'],
        default: 'eventadmin'
    }

});

module.exports = mongoose.model('Admin', AdminSchema);