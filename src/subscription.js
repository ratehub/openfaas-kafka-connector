class Subscription{

    constructor(stream, name, functions, processor){
        this.stream = stream;
        this.name = name;
        this.processor = processor;
        this.functions = functions;
    }
}

module.exports = Subscription;
