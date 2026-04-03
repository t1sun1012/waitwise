#include <iostream>
#include <cstdlib>   // rand, srand
#include <ctime>     // time

using namespace std;

int main() {
    srand(time(0));  // seed random number generator

    int num1, num2;
    int correctAnswer;
    int userAnswer;
    char op;

    int problemType = rand() % 4;  // 0=+, 1=-, 2=*, 3=/

    if (problemType == 0) {
        // Addition
        num1 = rand() % 20 + 1;
        num2 = rand() % 20 + 1;
        op = '+';
        correctAnswer = num1 + num2;
    }
    else if (problemType == 1) {
        // Subtraction
        num1 = rand() % 20 + 1;
        num2 = rand() % 20 + 1;

        // Swap so answer is not negative
        if (num2 > num1) {
            int temp = num1;
            num1 = num2;
            num2 = temp;
        }

        op = '-';
        correctAnswer = num1 - num2;
    }
    else if (problemType == 2) {
        // Multiplication
        num1 = rand() % 12 + 1;
        num2 = rand() % 12 + 1;
        op = '*';
        correctAnswer = num1 * num2;
    }
    else {
        // Division with whole-number answer
        num2 = rand() % 12 + 1;              // divisor
        correctAnswer = rand() % 12 + 1;     // quotient
        num1 = num2 * correctAnswer;         // dividend
        op = '/';
    }

    cout << "Solve: " << num1 << " " << op << " " << num2 << " = ";
    cin >> userAnswer;

    if (userAnswer == correctAnswer) {
        cout << "Correct!" << endl;
    }
    else {
        cout << "Incorrect." << endl;
        cout << "The correct answer was " << correctAnswer << "." << endl;
    }

    return 0;
}
