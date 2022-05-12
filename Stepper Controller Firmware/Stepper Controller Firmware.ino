#define PHASE_PER_SECOND 1000
#define HALF_PHASE_US (500000 / PHASE_PER_SECOND)
#define PIN_ENA 8
#define PIN_STP 2
#define PIN_DIR 5
#define PIN_SWT 9

void setup() {
  pinMode(PIN_ENA, OUTPUT);
  pinMode(PIN_STP, OUTPUT);
  pinMode(PIN_DIR, OUTPUT);
  pinMode(PIN_SWT, INPUT_PULLUP);
  
  digitalWrite(PIN_ENA, HIGH);
  digitalWrite(PIN_DIR, LOW);

  Serial.begin(9600);
  Serial.print("R");
}

int lastSwtState = HIGH;

void loop() {
  char cmd = Serial.read();
  // Active low input switch
  int currentSwtState = digitalRead(PIN_SWT);
  if (currentSwtState != lastSwtState) {
    lastSwtState = currentSwtState;
    if (currentSwtState == LOW) {
      Serial.write("^");
    } else {
      Serial.write("_");
    }
  }

  switch(cmd) {
    case 'D': {
      digitalWrite(PIN_ENA, HIGH);
      break;
    }
    case 'E': {
      digitalWrite(PIN_ENA, LOW);
      break;
    }
    case 'S': {
      int times = 1;
      if (0x30 <= Serial.peek() <= 0x39) {
        times <<= Serial.read() - 0x30;
      }
      for(int i = 0; i < times; i++){
        digitalWrite(PIN_STP, HIGH);
        delayMicroseconds(HALF_PHASE_US);
        digitalWrite(PIN_STP, LOW);
        delayMicroseconds(HALF_PHASE_US);
      }
      break;
    }
    case 'F': {
      digitalWrite(PIN_DIR, LOW);
      break;
    }
    case 'B': {
      digitalWrite(PIN_DIR, HIGH);
      break;
    }
    case -1: {
      delayMicroseconds(10);}
    default: {
      return;
    }
  }
  Serial.print('k');
}
