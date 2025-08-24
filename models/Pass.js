const mongoose = require('mongoose');
const { v7: uuidv7, parse: uuidParse } = require('uuid');
const PassSchema = new mongoose.Schema({
    _id: {
        type: mongoose.Schema.Types.UUID,
        default: () => uuidParse(uuidv7()),
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    slot1: {
        type: String,
        default: null
    },
    slot2: {
        type: String,
        default: null
    },
    slot3: {
        type: String,
        default: null
    },
    slot4: {
        type: String,
        default: null
    },

});

module.exports = mongoose.model('Pass', PassSchema);