import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

# Load real features
df = pd.read_csv("real_features.csv")
X = df.drop('label', axis=1).values
y = df['label'].values

print(f"Total samples: {len(y)}")
print(f"Panic: {sum(y)} | Normal: {len(y)-sum(y)}")

# Train
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Pipeline with scaling
clf = Pipeline([
    ('scaler', StandardScaler()),
    ('model', GradientBoostingClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        random_state=42
    ))
])

clf.fit(X_train, y_train)

# Evaluate
train_acc = clf.score(X_train, y_train)
test_acc  = clf.score(X_test, y_test)
cv_scores = cross_val_score(clf, X, y, cv=5)

print(f"\nTrain accuracy:  {train_acc:.2%}")
print(f"Test accuracy:   {test_acc:.2%}")
print(f"Cross-val mean:  {cv_scores.mean():.2%}")
print(f"Cross-val std:   {cv_scores.std():.2%}")

# Save
joblib.dump(clf, "panic_classifier_real.pkl")
print("\nReal classifier saved as panic_classifier_real.pkl")