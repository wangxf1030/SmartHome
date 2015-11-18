// we want mraa to be at least version 0.6.1
var mraa = require('mraa');


//Set up for database connection and schema
var mongoose = require('mongoose');
mongoose.connect('mongodb://winsonlyu:8365123jm@ds053894.mongolab.com:53894/csdb');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));


console.log('system start');
//Schema of mongoDB
var sleepAnalysisSchema = mongoose.Schema({
    name: String,
    value: Number,
    day: Number,
    hour: Number,
    minute: Number
});
var sleepQualityResultSchema = mongoose.Schema({
    name: String,
    day: Number,
    month: Number,
    sleepQualityResult: String,
});
var sleepAnalysis = mongoose.model('SleepAnalysis', sleepAnalysisSchema);
var sleepQualityResult = mongoose.model('SleepQualityResult', sleepQualityResultSchema);
var sleepQuality = 'Good';
var needReset = 1;

//set up the display
var lcd = require('jsupm_i2clcd');
var display = new lcd.Jhd1313m1(0, 0x3E, 0x62);
display.setCursor(0,0);
display.write('Fang is cute');
display.setCursor(1,0);
display.write('and sexy');

//set up sensor pins

//temperature
var analogPin0 = new mraa.Aio(0);

//air quality
var analogPin1 = new mraa.Aio(1);

//light
var analogPin2 = new mraa.Aio(2);

//sound
var analogPin3 = new mraa.Aio(3);

var touch_sensor_value = 0, last_t_sensor_value;

//Touch Sensor connected to D3 connector
var digital_pin_D3 = new mraa.Gpio(3);
digital_pin_D3.dir(mraa.DIR_IN);

//Buzzer
var digital_pin_D6 = new mraa.Gpio(6);
digital_pin_D6.dir(mraa.DIR_OUT);
digital_pin_D6.write(0);


function message(id,value) {
    this.id = id
    this.value = value
}


var counter = 0;

var wakeup = 0;

 /* The function setInterval has implemented the Event Queue structure. Messages containing the sensor data are first collected
  * by the dispatcher. Then the dispatcher sent out the messages to different function modules.
  */
setInterval(function () {
    touch_sensor_value = digital_pin_D3.read();
    if (touch_sensor_value === 1 && last_t_sensor_value === 0) {

        if(counter % 4 ==0){
            dispatcher(new message('temp',convertToCelsius(analogPin0.read())));

        }else if(counter % 4==1){
            dispatcher(new message('air',analogPin1.read()));
        }
        else if(counter % 4==2)
        {
            dispatcher(new message('sleepFetch',sleepQuality));
        }
        else {
            if(wakeup === 0)
            {  
               lcdBuzzerController(0,'Wake Up','On');
               wakeup=1;
            }
            else
            {
                lcdBuzzerController(0,'Wake Up','Off');
                wakeup=0;
            }
        }
        counter++;
    }
    last_t_sensor_value = touch_sensor_value;
}, 100);

//Send out fire-detection message periodically
setInterval(function () {

    dispatcher(new message('fire',[convertToCelsius(analogPin0.read()),analogPin1.read()]));

}, 1000);

//Send out sleep quality message peroidically
setInterval(function () {

    dispatcher(new message('sleepSave',analogPin3.read()));

}, 3000);


var i = 0;
var timeInterval = 60;

var maxLightDelta = 0;
var maxSoundDelta = 0;

var light = 0;
var sound = 0;
//loop for monitoring light and sound changes
setInterval(function () {

    if(wakeup==1)
    {    
        var currentLight = analogPin2.read();
        var currentSound = analogPin3.read();
        
        if(light!=0 && sound!=0)
        {
            var lightDelta = Math.abs(light - currentLight);
            //console.log('last'+sound+'current'+currentSound);
            var soundDelta = Math.abs(sound - currentSound);
            if(lightDelta>maxLightDelta)
                maxLightDelta = lightDelta;
            if(soundDelta>maxSoundDelta)
                maxSoundDelta = soundDelta;
            
        }
         
        light = currentLight; 
        sound = currentSound;

        if(i===timeInterval)
        {
            dispatcher(new message('wakeup',[maxLightDelta,maxSoundDelta]));
            i = 0;
            maxLightDelta = 0;
            maxSoundDeltaSound = 0;
            
        }
        i++;
    }

}, 1000);



/* Different function modules subscribe to the messages they need. More than one module can subscribe to the same message.
 * Function modules can be added below in the corresponding block
 */
function dispatcher(message)
{
    if(message.id === 'temp')
    {
        rangeChecker(-20,50,'Temperature',message.value);
    }
    else if(message.id === 'air')
    {
        rangeChecker(0,200,'Air Quality',message.value);
    }
    else if(message.id === 'fire')
    {
        fireDetection(message.value);
    }
    else if(message.id === 'sleepFetch')
    {
        querySleepQuality(message.value);
    }
    else if(message.id === 'sleepSave')
    {
        saveSoundData(message.value);
    }
    else if(message.id === 'wakeup')
    {
        wakeupDetection(message.value);
    }
}


//Convert data read from temperature sensor to celsius 
function convertToCelsius(tempData)
{
    var a = tempData;
    var resistance = (1023 - a) * 10000 / a; //get the resistance of the sensor;
    var celsius_temperature = 1 / (Math.log(resistance / 10000) / 3975 + 1 / 298.15) - 273.15;//convert to temperature via datasheet ;
    return Math.round(celsius_temperature);
}


function rangeChecker(lower,upper,module,value)
{
    if( value > lower && value < upper)
        lcdBuzzerController(0,module,value);
    else
        lcdBuzzerController(1,module,value);
}

function fireDetection(value)
{
    //value[0]--> Temperature, value[1] --> Air Quality
    if(value[0]>50 && value[1] > 200)
        lcdBuzzerController(1,'On',' Fire');
}

function wakeupDetection(value)
{
    //value[0]--> Light, value[1] --> Sound
   // console.log(value[0],value[1]);
    if(value[0] < 100 && value[1] < 1000)
        digital_pin_D6.write(1);
} 


function lcdBuzzerController(status,module,value)
{
    //status: 0->Normal, 1->Abnormal
    if(status === 0)
    {
        //console.log('Normal');
        display.clear();
        display.setCursor(0,0);
        display.setColor(255,255,255);
        display.write(module+' '+value);
        digital_pin_D6.write(0);
    }

    else if(status === 1)
    {
        //console.log('Abnormal');
        display.clear();
        display.setCursor(0,0);
        display.setColor(255,0,0);
        display.write(module+' '+value);
        digital_pin_D6.write(1);
    }
    else
    {
        console.log('Status Error');
    }
}


/*
Save tonight's sound data ( 2:00am - 6:00am )to database
Then save today's sleep quality to database after saving sound data
*/
function saveSoundData(soundData){
    var myDay = new Date();

    if(myDay.getHours() >= 10 && myDay.getHours() <=14 ){
        needReset=1;
        var record = new sleepAnalysis({
            name: 'sleepingSoundData',
            value: soundData,//This should be changed to sound data
            day: new Date().getDay(),
            hour:new Date().getHours(),
            minute: new Date().getMinutes()
        });
        record.save(function (err) {if (err) return console.error(err);});
    }

    if(myDay.getHours() >14 && needReset){
        var soundSum = todaySleepingDataSum();
        if(soundSum < 480000)
            sleepQuality = 'Good';
        else
            sleepQuality = 'Poor';
        needReset=0;
        var result = new sleepQualityResult({
            name: 'sleepQualityResult',
            day: new Date().getDay(),
            month: new Date().getMonth(),
            sleepQualityResult: sleepQuality

        });
        result.save(function (err) {if (err) return console.error(err);});

    }
}

//Helper: Calculate one day sound sum during night
function todaySleepingDataSum(){
    var query = sleepAnalysis.find({name:/sleepingSoundData/,day:new Date().getDay()});
    var sum=0;
    query.exec(function(err,sleeps){
        if(err)
            return console.log(err);
        sleeps.forEach(function(sleep){
            sum += sleep.value;
        });
        return sum;
    });
}

/*
show sleep quality on LCD: this is a workaround since reading from
database takes 1-2 seconds and largely reduce the responsiveness
so directly shows the cached sleep quality
TODO: maybe query the sleep quality of a specific day
 */
function querySleepQuality(value){
        lcdBuzzerController(0,'Sleep',value);
    /*
    var query =  sleepQualityResult.find({day:new Date().getDay()});
    query.exec(function(err,sleeps){
        if(err)
            return console.log(err);
        sleeps.forEach(function(sleep){
            sleepQuality = sleep.sleepQualityResult;
        });  
    });
    */
}