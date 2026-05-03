const id = 'aevra-greeting-acknowledgement';
const describe = 'Acknowledges the user provided name and invites them to start a study support session.';

/**
 * Runs the logic to acknowledge the user's name based on provided facts.
 * @returns {Promise<Object>} The response object containing the greeting.
 */
async function run() {
  // Based on provided known facts
  const userData = {
    name: "THC in"
  };

  const responseMessage = `Hello, ${userData.name}. It is nice to meet you. I am ready to act as your aevra. What subject or topic would you like to learn about today?`;

  return {
    content: responseMessage,
    meta: {
      user_name: userData.name,
      session_type: 'general_study support'
    }
  };
}

module.exports = { id, describe, run };