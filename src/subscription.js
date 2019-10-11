class Subscription{

    constructor(stream,type,functions, processor){
        this.stream = stream;
        this.type = type;
        this.processor = processor;
        this.functions = functions;
    }
}

module.exports = Subscription;
