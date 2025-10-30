# What to Create

Build an Agentic Application that uses the llama-3 1-nemotron-nano-8B-v1 large language reasoning mode, deployed as an NVIDIA NIM inference microservice, and at least one Retrieval Embedding NIM, all deployed on either an Amazon EKS Cluster or an Amazon SageMaker AI endpoint.

## What to Submit

- Text description that explains the features and functionality of your project
- Demo video (should be under three minutes)
- URL to your public code repository
  - README file that contains deployment instructions

## Project details

Problem: I am not able to understand instantly the context of a new github repository when I am onboarded, there are subtle patterns I am not sure of

Solution: Takoping is a developer onboarding platform that provides intelligent repository visualization and analysis tools using genAI that will accelerate developer onboarding and reduce context-switching time for developers that struggle to quickly understand complex codebase structures and architectural patterns when joining new projects

- A visual canvas that shows the main modules of your repository and patterns that are used throughout to make sure you are coding the correct way
  - It should let you see a diagram of all the files in the repo and how they are connected
  - You should be able to see the data flow of the repo
  - You should be able to see the main architecture used in this repo (clean, etc)
  - You should have a text that shows what are the naming conventions used for all of the functions
  - You should be able to view it through objects
  - You should be able to click and expand on certain files / objects
  - It should be able to spot any irregularities with the structure
  - It should be able to determine if it's a monorepo / microservices
  - It should be able ot use the github repo with the github api
  - It should be primarily on an infinite canvas, but provide a text box to ask more about it if you want
  - If you do ask, it should be able to autonomously take you there (expanding the diagram to that point)
