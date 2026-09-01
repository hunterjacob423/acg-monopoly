/**
 * Binary search tree, keyed by string.
 *
 * Holds every ownable property keyed by name, so a trade screen can look up
 * "Old Kent Road" without scanning all 28, and can list them alphabetically for
 * free via an in-order traversal.
 *
 * Insert and search are O(log n) on a balanced tree and O(n) in the worst case,
 * which happens if keys are inserted already sorted — the tree then degenerates
 * into a linked list. Property names are inserted in board order, which is not
 * alphabetical, so the tree stays reasonably shaped in practice.
 *
 * Every operation here is written recursively, since the structure is itself
 * defined recursively: a tree is a key plus a left tree and a right tree.
 */

export class TreeNode<T> {
  left: TreeNode<T> | null = null;
  right: TreeNode<T> | null = null;
  constructor(public key: string, public value: T) {}
}

export class BinarySearchTree<T> {
  private root: TreeNode<T> | null = null;
  private count = 0;

  get size(): number { return this.count; }

  insert(key: string, value: T): void {
    this.root = this.insertInto(this.root, key.toLowerCase(), value);
  }

  /**
   * Recursive insert. Base case: an empty subtree becomes the new leaf.
   * Otherwise compare and recurse into the half the key must belong to.
   */
  private insertInto(node: TreeNode<T> | null, key: string, value: T): TreeNode<T> {
    if (node === null) {
      this.count++;
      return new TreeNode(key, value);
    }
    if (key < node.key) node.left = this.insertInto(node.left, key, value);
    else if (key > node.key) node.right = this.insertInto(node.right, key, value);
    else node.value = value; // exact key already present: overwrite
    return node;
  }

  /** Exact-match lookup. O(log n) average. */
  search(key: string): T | undefined {
    return this.searchFrom(this.root, key.toLowerCase());
  }

  private searchFrom(node: TreeNode<T> | null, key: string): T | undefined {
    if (node === null) return undefined;              // base case: not found
    if (key === node.key) return node.value;          // base case: found
    return key < node.key
      ? this.searchFrom(node.left, key)
      : this.searchFrom(node.right, key);
  }

  /**
   * In-order traversal: left subtree, then this node, then right subtree.
   * Because of the BST ordering rule this visits keys in sorted order, so it
   * yields an alphabetical list without any sorting step.
   */
  inOrder(): Array<{ key: string; value: T }> {
    const out: Array<{ key: string; value: T }> = [];
    this.traverseInOrder(this.root, out);
    return out;
  }

  private traverseInOrder(node: TreeNode<T> | null, out: Array<{ key: string; value: T }>): void {
    if (node === null) return;                        // base case
    this.traverseInOrder(node.left, out);
    out.push({ key: node.key, value: node.value });
    this.traverseInOrder(node.right, out);
  }

  /** Every key starting with the prefix — the basis of a type-ahead in a trade UI. */
  startingWith(prefix: string): T[] {
    const p = prefix.toLowerCase();
    return this.inOrder().filter((e) => e.key.startsWith(p)).map((e) => e.value);
  }

  /** Longest root-to-leaf path. Recursive, and a direct measure of how balanced the tree is. */
  height(): number { return this.heightOf(this.root); }

  private heightOf(node: TreeNode<T> | null): number {
    if (node === null) return 0;                      // base case
    return 1 + Math.max(this.heightOf(node.left), this.heightOf(node.right));
  }
}
