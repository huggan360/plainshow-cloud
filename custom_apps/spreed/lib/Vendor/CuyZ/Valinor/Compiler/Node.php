<?php

declare (strict_types=1);
namespace OCA\Talk\Vendor\CuyZ\Valinor\Compiler;

use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\AnonymousClassNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ArrayNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ClassNameNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ClassNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ClosureNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ComplianceNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ExpressionNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ForEachNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\FunctionCallNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\IfNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\LogicalAndNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\LogicalOrNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\MatchNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\MethodNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\NegateNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\NewClassNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ParameterDeclarationNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\PropertyDeclarationNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\PropertyNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ReturnNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ShortClosureNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\TernaryNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ThrowNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\ValueNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\VariableNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\WrapNode;
use OCA\Talk\Vendor\CuyZ\Valinor\Compiler\Native\YieldNode;
/** @internal */
abstract class Node
{
    abstract public function compile(Compiler $compiler): Compiler;
    public function asExpression(): ExpressionNode
    {
        return new ExpressionNode($this);
    }
    public function wrap(): ComplianceNode
    {
        return new ComplianceNode(new WrapNode($this));
    }
    /**
     * @param array<Node> $assignments
     */
    public static function array(array $assignments = []): ArrayNode
    {
        return new ArrayNode($assignments);
    }
    public static function anonymousClass(): AnonymousClassNode
    {
        return new AnonymousClassNode();
    }
    /**
     * @param class-string $name
     */
    public static function class(string $name): ClassNode
    {
        return new ClassNode($name);
    }
    /**
     * @param class-string $className
     */
    public static function className(string $className): ClassNameNode
    {
        return new ClassNameNode($className);
    }
    public static function closure(Node ...$nodes): ClosureNode
    {
        return new ClosureNode(...$nodes);
    }
    /**
     * @param non-empty-string $key
     * @param non-empty-string $item
     */
    public static function forEach(Node $value, string $key, string $item, Node $body): ForEachNode
    {
        return new ForEachNode($value, $key, $item, $body);
    }
    /**
     * @param non-empty-string $name
     * @param array<Node> $arguments
     */
    public static function functionCall(string $name, array $arguments = []): ComplianceNode
    {
        return new ComplianceNode(new FunctionCallNode($name, $arguments));
    }
    public static function if(Node $condition, Node $body): IfNode
    {
        return new IfNode($condition, $body);
    }
    /**
     * @no-named-arguments
     */
    public static function logicalAnd(Node ...$nodes): ComplianceNode
    {
        return new ComplianceNode(new LogicalAndNode(...$nodes));
    }
    /**
     * @no-named-arguments
     */
    public static function logicalOr(Node ...$nodes): ComplianceNode
    {
        return new ComplianceNode(new LogicalOrNode(...$nodes));
    }
    public static function match(Node $value): MatchNode
    {
        return new MatchNode($value);
    }
    /**
     * @param non-empty-string $name
     */
    public static function method(string $name): MethodNode
    {
        return new MethodNode($name);
    }
    public static function negate(Node $node): NegateNode
    {
        return new NegateNode($node);
    }
    /**
     * @param class-string $className
     */
    public static function newClass(string $className, Node ...$arguments): NewClassNode
    {
        return new NewClassNode($className, ...$arguments);
    }
    /**
     * @param non-empty-string $name
     */
    public static function parameterDeclaration(string $name, string $type): ParameterDeclarationNode
    {
        return new ParameterDeclarationNode($name, $type);
    }
    public static function property(string $name): ComplianceNode
    {
        return new ComplianceNode(new PropertyNode($name));
    }
    /**
     * @param non-empty-string $name
     */
    public static function propertyDeclaration(string $name, string $type): PropertyDeclarationNode
    {
        return new PropertyDeclarationNode($name, $type);
    }
    public static function return(Node $node): ReturnNode
    {
        return new ReturnNode($node);
    }
    public static function shortClosure(Node $return): ShortClosureNode
    {
        return new ShortClosureNode($return);
    }
    public static function ternary(Node $condition, Node $ifTrue, Node $ifFalse): TernaryNode
    {
        return new TernaryNode($condition, $ifTrue, $ifFalse);
    }
    public static function this(): ComplianceNode
    {
        return self::variable('this');
    }
    public static function throw(Node $node): ThrowNode
    {
        return new ThrowNode($node);
    }
    /**
     * @param array<mixed>|bool|float|int|string|null $value
     */
    public static function value(array|bool|float|int|string|null $value): ComplianceNode
    {
        return new ComplianceNode(new ValueNode($value));
    }
    public static function variable(string $name): ComplianceNode
    {
        return new ComplianceNode(new VariableNode($name));
    }
    public static function yield(Node $key, Node $value): YieldNode
    {
        return new YieldNode($key, $value);
    }
}